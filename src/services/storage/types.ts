export type StorageProviderType = 'local' | 'aws' | 's3' | 'digitalocean';

export interface StorageUploadResult {
  url: string;
  key: string;
  filePath?: string;
  storageType: StorageProviderType;
  fileSize?: number;
}

export interface StorageFileOptions {
  contentType?: string;
  cacheControl?: string;
  isPublic?: boolean;
}

export interface IStorageProvider {
  readonly providerType: StorageProviderType;
  isConfigured(): Promise<boolean>;
  uploadFile(
    key: string,
    body: Buffer | Uint8Array | string,
    options?: StorageFileOptions
  ): Promise<StorageUploadResult>;
  deleteFile(key: string): Promise<void>;
  getFileUrl(key: string): Promise<string>;
  getPublicBaseUrl?(): Promise<string>;
}

export interface S3ProviderConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  pathStyle?: boolean;
}

export interface DigitalOceanProviderConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  endpoint: string;
}
