import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { IStorageProvider, StorageFileOptions, StorageProviderType, StorageUploadResult } from './types';
import { logger } from '../../lib/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_ROOT = path.join(__dirname, '../../../uploads');

export class LocalStorageProvider implements IStorageProvider {
  readonly providerType: StorageProviderType = 'local';

  async isConfigured(): Promise<boolean> {
    return true;
  }

  private ensureDir(dirPath: string): string {
    const fullPath = path.join(UPLOADS_ROOT, dirPath);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    return fullPath;
  }

  async uploadFile(
    key: string,
    body: Buffer | Uint8Array | string,
    options?: StorageFileOptions
  ): Promise<StorageUploadResult> {
    const cleanKey = key.replace(/^\/+/, '').replace(/^uploads\//, '');
    const dir = path.dirname(cleanKey);
    this.ensureDir(dir);

    const fullPath = path.join(UPLOADS_ROOT, cleanKey);
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    await fs.promises.writeFile(fullPath, buffer);

    const relativePath = `/uploads/${cleanKey.replace(/\\/g, '/')}`;

    return {
      url: relativePath,
      key: cleanKey,
      filePath: relativePath,
      storageType: 'local',
      fileSize: buffer.length,
    };
  }

  async deleteFile(key: string): Promise<void> {
    if (!key) return;
    const cleanKey = key.replace(/^\/+/, '').replace(/^uploads\//, '');
    const fullPath = path.join(UPLOADS_ROOT, cleanKey);

    if (fs.existsSync(fullPath)) {
      try {
        await fs.promises.unlink(fullPath);
        logger.debug({ key: cleanKey }, 'Deleted local file');
      } catch (err) {
        logger.error({ err, key: cleanKey }, 'Failed to delete local file');
      }
    }
  }

  async getFileUrl(key: string): Promise<string> {
    if (key.startsWith('http://') || key.startsWith('https://')) return key;
    let cleanKey = key.replace(/^\/+/, '');
    if (!cleanKey.startsWith('uploads/')) {
      cleanKey = `uploads/${cleanKey}`;
    }
    return `/${cleanKey.replace(/\\/g, '/')}`;
  }

  async getPublicBaseUrl(): Promise<string> {
    return '/uploads';
  }
}
