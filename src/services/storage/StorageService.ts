import { IStorageProvider, StorageFileOptions, StorageProviderType, StorageUploadResult } from './types';
import { LocalStorageProvider } from './LocalStorageProvider';
import { S3StorageProvider } from './S3StorageProvider';
import { DigitalOceanStorageProvider } from './DigitalOceanStorageProvider';
import { SettingsModel } from '../../models/Settings';
import { logger } from '../../lib/logger';

export class StorageService {
  private static instance: StorageService;
  private localProvider: LocalStorageProvider;
  private s3Provider: S3StorageProvider;
  private digitalOceanProvider: DigitalOceanStorageProvider;

  private constructor() {
    this.localProvider = new LocalStorageProvider();
    this.s3Provider = new S3StorageProvider();
    this.digitalOceanProvider = new DigitalOceanStorageProvider();
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  /**
   * Normalizes any provider alias string to a canonical StorageProviderType
   */
  public normalizeProviderType(rawDriver?: string | null): StorageProviderType {
    if (!rawDriver) return 'local';
    const lower = rawDriver.toLowerCase().trim();
    if (lower === 's3' || lower === 'aws') return 'aws';
    if (lower === 'digitalocean' || lower === 'do' || lower === 'spaces') return 'digitalocean';
    return 'local';
  }

  /**
   * Resolves the active storage provider based on database settings and environment variables
   */
  public async getActiveProviderType(): Promise<StorageProviderType> {
    try {
      const settings = await SettingsModel.findOne().select('storageDriver').lean();
      const driver = settings?.storageDriver || process.env.STORAGE_DRIVER || 'local';
      return this.normalizeProviderType(driver);
    } catch {
      return 'local';
    }
  }

  /**
   * Returns the provider instance for the specified or currently active provider type
   */
  public async getProvider(type?: StorageProviderType | string): Promise<IStorageProvider> {
    const targetType = type ? this.normalizeProviderType(type) : await this.getActiveProviderType();

    switch (targetType) {
      case 'aws':
        return this.s3Provider;
      case 'digitalocean':
        return this.digitalOceanProvider;
      case 'local':
      default:
        return this.localProvider;
    }
  }

  /**
   * Central upload method that routes the file to the active storage provider
   */
  public async uploadFile(
    key: string,
    body: Buffer | Uint8Array | string,
    options?: StorageFileOptions
  ): Promise<StorageUploadResult> {
    const activeProvider = await this.getProvider();
    logger.debug({ provider: activeProvider.providerType, key }, 'Uploading file to active storage provider');
    return activeProvider.uploadFile(key, body, options);
  }

  /**
   * Central delete method. If storageType is given, delegates to that provider, otherwise active provider.
   */
  public async deleteFile(key: string, storageType?: StorageProviderType | string): Promise<void> {
    if (!key) return;
    const provider = await this.getProvider(storageType);
    return provider.deleteFile(key);
  }

  /**
   * Generates public URL for a given file key
   */
  public async getFileUrl(key: string, storageType?: StorageProviderType | string): Promise<string> {
    if (!key) return '';
    if (key.startsWith('http://') || key.startsWith('https://')) return key;
    const provider = await this.getProvider(storageType);
    return provider.getFileUrl(key);
  }

  /**
   * Returns base URL for current storage provider
   */
  public async getPublicBaseUrl(): Promise<string> {
    const provider = await this.getProvider();
    if (provider.getPublicBaseUrl) {
      return provider.getPublicBaseUrl();
    }
    return '/uploads';
  }

  /**
   * Validates provider configuration when saving settings
   */
  public validateProviderConfig(
    provider: string,
    payload: Record<string, any>,
    existingSettings?: Record<string, any>
  ): { valid: boolean; error?: string } {
    const normalized = this.normalizeProviderType(provider);

    if (normalized === 'aws') {
      const bucket = payload.awsBucket || payload.s3Bucket || existingSettings?.awsBucket || process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME;
      const region = payload.awsRegion || payload.s3Region || existingSettings?.awsRegion || process.env.AWS_S3_REGION || process.env.AWS_REGION;
      const accessKey = payload.awsAccessKeyId || payload.awsAccessKey || payload.s3AccessKey || existingSettings?.awsAccessKeyId || process.env.AWS_S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
      const secretKey = payload.awsSecretAccessKey || payload.awsSecretKey || payload.s3SecretKey || existingSettings?.awsSecretAccessKey || process.env.AWS_S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

      if (!bucket) return { valid: false, error: 'AWS Bucket Name is required when AWS S3 is selected.' };
      if (!region) return { valid: false, error: 'AWS Region is required when AWS S3 is selected.' };
      if (!accessKey) return { valid: false, error: 'AWS Access Key is required when AWS S3 is selected.' };
      if (!secretKey) return { valid: false, error: 'AWS Secret Key is required when AWS S3 is selected.' };
    }

    if (normalized === 'digitalocean') {
      const spaceName = payload.doSpacesBucket || payload.doSpaceName || payload.digitalOceanSpaceName || existingSettings?.doSpacesBucket || existingSettings?.doSpaceName || process.env.DO_SPACES_BUCKET;
      const region = payload.doSpacesRegion || payload.doRegion || payload.digitalOceanRegion || existingSettings?.doSpacesRegion || existingSettings?.doRegion || process.env.DO_SPACES_REGION;
      const accessKey = payload.doSpacesAccessKey || payload.doAccessKey || payload.digitalOceanAccessKey || existingSettings?.doSpacesAccessKey || existingSettings?.doAccessKey || process.env.DO_SPACES_ACCESS_KEY;
      const secretKey = payload.doSpacesSecretKey || payload.doSecretKey || payload.digitalOceanSecretKey || existingSettings?.doSpacesSecretKey || existingSettings?.doSecretKey || process.env.DO_SPACES_SECRET_KEY;
      const endpoint = payload.doSpacesEndpoint || payload.doEndpoint || payload.digitalOceanEndpoint || existingSettings?.doSpacesEndpoint || existingSettings?.doEndpoint || process.env.DO_SPACES_ENDPOINT;

      if (!spaceName) return { valid: false, error: 'DigitalOcean Space Name is required when DigitalOcean is selected.' };
      if (!region) return { valid: false, error: 'DigitalOcean Region is required when DigitalOcean is selected.' };
      if (!accessKey) return { valid: false, error: 'DigitalOcean Access Key is required when DigitalOcean is selected.' };
      if (!secretKey) return { valid: false, error: 'DigitalOcean Secret Key is required when DigitalOcean is selected.' };
      if (!endpoint) return { valid: false, error: 'DigitalOcean Endpoint is required when DigitalOcean is selected.' };
    }

    return { valid: true };
  }
}

export const storageService = StorageService.getInstance();
