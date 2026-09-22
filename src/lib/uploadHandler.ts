import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import type { FastifyRequest } from 'fastify';
import { MediaFileModel } from '../models/MediaFile';
import { MediaFolderModel } from '../models/MediaFolder';
import { Types } from 'mongoose';
import { transcodeToHls } from './hlsTranscoder';
import { logger } from './logger';
import { storageService, StorageProviderType } from '../services/storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

export const UPLOAD_TYPES = {
  IMAGE: {
    name: 'image',
    allowedExts: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'],
    defaultDir: ''
  },
  VIDEO: {
    name: 'video',
    allowedExts: ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv'],
    defaultDir: 'videos'
  },
  DOCUMENT: {
    name: 'document',
    allowedExts: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'],
    defaultDir: 'documents'
  },
  CATEGORY_THUMBNAIL: {
    name: 'category-thumbnail',
    allowedExts: ['.jpg', '.jpeg', '.png', '.webp'],
    defaultDir: 'categories'
  },
  CATEGORY_BANNER: {
    name: 'category-banner',
    allowedExts: ['.jpg', '.jpeg', '.png', '.webp'],
    defaultDir: 'categories'
  },
  CATEGORY_ICON: {
    name: 'category-icon',
    allowedExts: ['.jpg', '.jpeg', '.png', '.webp', '.svg'],
    defaultDir: 'categories'
  },
  GENRE: {
    name: 'genre',
    allowedExts: ['.jpg', '.jpeg', '.png', '.webp'],
    defaultDir: 'genres'
  },
  ACTOR: {
    name: 'actor',
    allowedExts: ['.jpg', '.jpeg', '.png', '.webp'],
    defaultDir: 'actors'
  },
  DIRECTOR: {
    name: 'director',
    allowedExts: ['.jpg', '.jpeg', '.png', '.webp'],
    defaultDir: 'directors'
  },
  LANGUAGE: {
    name: 'language',
    allowedExts: ['.jpg', '.jpeg', '.png', '.webp', '.svg'],
    defaultDir: 'languages'
  },
  MEDIA_LIBRARY: {
    name: 'media-library',
    allowedExts: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4', '.webm', '.mov', '.mkv', '.avi', '.flv'],
    defaultDir: 'media'
  },
  BANNER: {
    name: 'banner',
    allowedExts: ['.jpg', '.jpeg', '.png', '.webp'],
    defaultDir: 'banners'
  },
  PROMOTION: {
    name: 'promotion',
    allowedExts: ['.jpg', '.jpeg', '.png', '.webp'],
    defaultDir: 'promotions'
  }
} as const;

export type UploadType = keyof typeof UPLOAD_TYPES;

export interface UploadedFileInfo {
  originalName: string;
  fileName: string;
  filePath: string;
  url: string;
  fileSize: number;
  mimeType: string;
  uploadType: UploadType;
  storageType?: 'local' | 's3' | 'aws' | 'digitalocean';
  s3Key?: string;
}

export const ensureUploadDir = (dirPath: string) => {
  const fullPath = path.join(UPLOADS_ROOT, dirPath);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
  return fullPath;
};

export const generateUniqueFileName = (originalName: string): string => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 10);
  const ext = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, ext)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${timestamp}-${randomString}${baseName ? `-${baseName}` : ''}${ext}`;
};

export const validateFileType = (fileName: string, uploadType: UploadType): boolean => {
  const typeConfig = UPLOAD_TYPES[uploadType];
  const ext = path.extname(fileName).toLowerCase();
  return (typeConfig.allowedExts as readonly string[]).includes(ext);
};

// Helper to check if a file is a video based on file extension or mimetype
const isVideoFile = (fileName: string, mimeType: string): boolean => {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.m4v', '.mpeg', '.mpg'];
  const ext = path.extname(fileName).toLowerCase();
  return videoExtensions.includes(ext) || mimeType.startsWith('video/');
};

export const saveFileFromPart = async (
  part: any,
  request: FastifyRequest,
  uploadType: UploadType,
  customDir?: string,
  options?: {
    trackInMediaLibrary?: boolean;
    source?: string;
    sourceId?: string;
    folderId?: string;
    contentName?: string;
    contentType?: string;
  }
): Promise<UploadedFileInfo> => {
  const typeConfig = UPLOAD_TYPES[uploadType];
  const targetDir = customDir || typeConfig.defaultDir;

  if (!validateFileType(part.filename, uploadType)) {
    throw new Error(
      `Invalid file type for ${typeConfig.name}. Allowed types: ${typeConfig.allowedExts.join(', ')}`
    );
  }

  // Auto-resolve folder ID if not provided
  let resolvedFolderId = options?.folderId;
  if (!resolvedFolderId && typeConfig.defaultDir) {
    try {
      const folderMatch = await MediaFolderModel.findOne({ name: { $regex: new RegExp(`^${typeConfig.defaultDir}$`, 'i') } });
      if (folderMatch) {
        resolvedFolderId = folderMatch._id.toString();
      }
    } catch (error) {
      console.error('Error resolving folder ID:', error);
    }
  }

  const fileName = generateUniqueFileName(part.filename);
  const relativeFilePath = path.join(targetDir, fileName).replace(/\\/g, '/');
  const buffer = await part.toBuffer();
  const fileSize = buffer.length;
  const mimeType = part.mimetype || 'application/octet-stream';
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

  // Check deduplication
  const existingFile = await MediaFileModel.findOne({
    $or: [
      { contentHash },
      { name: part.filename, fileSize }
    ]
  });

  if (existingFile) {
    let needsUpdate = false;
    if (!existingFile.contentHash && contentHash) {
      existingFile.contentHash = contentHash;
      needsUpdate = true;
    }
    if (options?.contentName && !existingFile.contentName) {
      existingFile.contentName = options.contentName;
      needsUpdate = true;
    }
    if (options?.contentType && !existingFile.contentType) {
      existingFile.contentType = options.contentType;
      needsUpdate = true;
    }
    if (needsUpdate) {
      await existingFile.save().catch(err => console.error("Error updating existing file metadata:", err));
    }

    return {
      originalName: existingFile.name,
      fileName: path.basename(existingFile.filePath || existingFile.url),
      filePath: existingFile.filePath || existingFile.url,
      url: existingFile.url,
      fileSize: existingFile.fileSize,
      mimeType: existingFile.fileType,
      uploadType,
      storageType: existingFile.storageType as any,
      s3Key: existingFile.s3Key,
    };
  }

  const activeProviderType = await storageService.getActiveProviderType();
  const protocol = request.protocol;
  const host = request.headers.host;
  const baseUrl = `${protocol}://${host}`;

  let finalUrl = '';
  let finalFilePath = '';
  let s3Key: string | undefined = undefined;

  if (activeProviderType === 'local') {
    ensureUploadDir(targetDir);
    const fullFilePath = path.join(UPLOADS_ROOT, relativeFilePath);
    await fs.promises.writeFile(fullFilePath, buffer);

    finalFilePath = `/uploads/${relativeFilePath}`;
    finalUrl = `${baseUrl}/uploads/${relativeFilePath}`;
  } else {
    // AWS S3 or DigitalOcean Spaces
    const uploadResult = await storageService.uploadFile(relativeFilePath, buffer, {
      contentType: mimeType,
    });
    finalUrl = uploadResult.url;
    finalFilePath = uploadResult.filePath || uploadResult.url;
    s3Key = uploadResult.key;

    // For video files, also write temporary copy for local HLS processing if needed
    if (isVideoFile(part.filename, mimeType)) {
      ensureUploadDir(targetDir);
      const fullFilePath = path.join(UPLOADS_ROOT, relativeFilePath);
      await fs.promises.writeFile(fullFilePath, buffer).catch(() => {});
    }
  }

  const fileInfo: UploadedFileInfo = {
    originalName: part.filename,
    fileName,
    filePath: finalFilePath,
    url: finalUrl,
    fileSize,
    mimeType,
    uploadType,
    storageType: activeProviderType as any,
    s3Key,
  };

  if (options?.trackInMediaLibrary !== false) {
    try {
      const mediaFile = await MediaFileModel.create({
        name: part.filename,
        url: fileInfo.url,
        filePath: fileInfo.filePath,
        fileSize,
        fileType: mimeType,
        folder: resolvedFolderId ? new Types.ObjectId(resolvedFolderId) : undefined,
        source: options?.source || uploadType.toLowerCase(),
        sourceId: options?.sourceId ? new Types.ObjectId(options.sourceId) : undefined,
        contentHash,
        contentName: options?.contentName,
        contentType: options?.contentType,
        storageType: activeProviderType as any,
        s3Key,
      });

      if (isVideoFile(part.filename, mimeType)) {
        const fullLocalPath = path.join(UPLOADS_ROOT, relativeFilePath);
        if (fs.existsSync(fullLocalPath)) {
          transcodeToHls(mediaFile._id.toString(), fullLocalPath, baseUrl).catch(err => {
            logger.error({ err, mediaFileId: mediaFile._id }, 'Failed to transcode video to HLS');
          });
        }
      }
    } catch (error) {
      console.error('Failed to track file in media library:', error);
    }
  }

  return fileInfo;
};

export const deleteUploadedFile = async (relativeFilePath: string, storageType?: 'local' | 's3' | 'aws' | 'digitalocean' | string) => {
  if (!relativeFilePath) return;
  await storageService.deleteFile(relativeFilePath, storageType as StorageProviderType);
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default {
  UPLOAD_TYPES,
  ensureUploadDir,
  generateUniqueFileName,
  validateFileType,
  saveFileFromPart,
  deleteUploadedFile,
  formatFileSize
};

