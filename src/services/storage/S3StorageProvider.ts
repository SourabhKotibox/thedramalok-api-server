import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { IStorageProvider, S3ProviderConfig, StorageFileOptions, StorageProviderType, StorageUploadResult } from './types';
import { SettingsModel } from '../../models/Settings';
import { logger } from '../../lib/logger';

export class S3StorageProvider implements IStorageProvider {
  readonly providerType: StorageProviderType = 'aws';

  async getConfig(): Promise<S3ProviderConfig> {
    const settings = await SettingsModel.findOne().lean();
    return {
      accessKeyId:
        settings?.awsAccessKeyId ||
        process.env.AWS_S3_ACCESS_KEY_ID ||
        process.env.AWS_ACCESS_KEY_ID ||
        '',
      secretAccessKey:
        settings?.awsSecretAccessKey ||
        process.env.AWS_S3_SECRET_ACCESS_KEY ||
        process.env.AWS_SECRET_ACCESS_KEY ||
        '',
      region:
        settings?.awsRegion ||
        process.env.AWS_S3_REGION ||
        process.env.AWS_REGION ||
        'us-east-1',
      bucket:
        settings?.awsBucket ||
        process.env.AWS_S3_BUCKET_NAME ||
        process.env.AWS_S3_BUCKET ||
        process.env.AWS_BUCKET_NAME ||
        '',
      pathStyle: settings?.awsPathStyleEndpoint || false,
    };
  }

  async isConfigured(): Promise<boolean> {
    const config = await this.getConfig();
    return !!(config.accessKeyId && config.secretAccessKey && config.bucket && config.region);
  }

  private async getClient(): Promise<{ client: S3Client; config: S3ProviderConfig }> {
    const config = await this.getConfig();
    if (!config.accessKeyId || !config.secretAccessKey || !config.bucket) {
      throw new Error('AWS S3 credentials or bucket name not configured');
    }

    const client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.pathStyle && {
        forcePathStyle: true,
      }),
    });

    return { client, config };
  }

  private cleanKey(key: string): string {
    return key.replace(/^\/+/, '').replace(/^uploads\//, '');
  }

  async uploadFile(
    key: string,
    body: Buffer | Uint8Array | string,
    options?: StorageFileOptions
  ): Promise<StorageUploadResult> {
    const { client, config } = await this.getClient();
    const cleanKey = this.cleanKey(key);
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);

    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: cleanKey,
      Body: buffer,
      ContentType: options?.contentType || 'application/octet-stream',
      CacheControl: options?.cacheControl || 'max-age=31536000',
    });

    await client.send(command);

    const url = config.pathStyle
      ? `https://s3.${config.region}.amazonaws.com/${config.bucket}/${cleanKey}`
      : `https://${config.bucket}.s3.${config.region}.amazonaws.com/${cleanKey}`;

    return {
      url,
      key: cleanKey,
      filePath: url,
      storageType: 'aws',
      fileSize: buffer.length,
    };
  }

  async deleteFile(key: string): Promise<void> {
    if (!key) return;
    try {
      const { client, config } = await this.getClient();
      const cleanKey = this.cleanKey(key);

      const command = new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: cleanKey,
      });

      await client.send(command);
      logger.debug({ key: cleanKey }, 'Deleted S3 file');
    } catch (err) {
      logger.error({ err, key }, 'Failed to delete file from S3');
    }
  }

  async getFileUrl(key: string): Promise<string> {
    if (key.startsWith('http://') || key.startsWith('https://')) return key;
    const config = await this.getConfig();
    const cleanKey = this.cleanKey(key);
    return config.pathStyle
      ? `https://s3.${config.region}.amazonaws.com/${config.bucket}/${cleanKey}`
      : `https://${config.bucket}.s3.${config.region}.amazonaws.com/${cleanKey}`;
  }

  async getPublicBaseUrl(): Promise<string> {
    const config = await this.getConfig();
    return config.pathStyle
      ? `https://s3.${config.region}.amazonaws.com/${config.bucket}`
      : `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
  }
}
