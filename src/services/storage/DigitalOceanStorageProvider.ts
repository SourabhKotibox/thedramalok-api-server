import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DigitalOceanProviderConfig, IStorageProvider, StorageFileOptions, StorageProviderType, StorageUploadResult } from './types';
import { SettingsModel } from '../../models/Settings';
import { logger } from '../../lib/logger';

export class DigitalOceanStorageProvider implements IStorageProvider {
  readonly providerType: StorageProviderType = 'digitalocean';

  async getConfig(): Promise<DigitalOceanProviderConfig> {
    const settings = (await SettingsModel.findOne().lean()) as any;
    const region =
      settings?.doSpacesRegion ||
      settings?.doRegion ||
      settings?.digitalOceanRegion ||
      process.env.DO_SPACES_REGION ||
      process.env.DO_REGION ||
      'nyc3';

    let endpoint =
      settings?.doSpacesEndpoint ||
      settings?.doEndpoint ||
      settings?.digitalOceanEndpoint ||
      process.env.DO_SPACES_ENDPOINT ||
      process.env.DO_ENDPOINT ||
      `https://${region}.digitaloceanspaces.com`;

    if (endpoint && !endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
      endpoint = `https://${endpoint}`;
    }

    return {
      accessKeyId:
        settings?.doSpacesAccessKey ||
        settings?.doAccessKey ||
        settings?.digitalOceanAccessKey ||
        process.env.DO_SPACES_ACCESS_KEY ||
        process.env.DO_ACCESS_KEY ||
        '',
      secretAccessKey:
        settings?.doSpacesSecretKey ||
        settings?.doSecretKey ||
        settings?.digitalOceanSecretKey ||
        process.env.DO_SPACES_SECRET_KEY ||
        process.env.DO_SECRET_KEY ||
        '',
      region,
      bucket:
        settings?.doSpacesBucket ||
        settings?.doSpaceName ||
        settings?.digitalOceanSpaceName ||
        process.env.DO_SPACES_BUCKET ||
        process.env.DO_BUCKET ||
        '',
      endpoint,
    };
  }

  async isConfigured(): Promise<boolean> {
    const config = await this.getConfig();
    return !!(config.accessKeyId && config.secretAccessKey && config.bucket && config.region && config.endpoint);
  }

  private async getClient(): Promise<{ client: S3Client; config: DigitalOceanProviderConfig }> {
    const config = await this.getConfig();
    if (!config.accessKeyId || !config.secretAccessKey || !config.bucket) {
      throw new Error('DigitalOcean Spaces credentials or space name not configured');
    }

    const client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: false, // DO Spaces supports bucket.region.digitaloceanspaces.com
    });

    return { client, config };
  }

  private cleanKey(key: string): string {
    return key.replace(/^\/+/, '').replace(/^uploads\//, '');
  }

  private buildPublicUrl(config: DigitalOceanProviderConfig, key: string): string {
    const cleanEndpoint = config.endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `https://${config.bucket}.${cleanEndpoint}/${key}`;
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
      ACL: 'public-read',
      CacheControl: options?.cacheControl || 'max-age=31536000',
    });

    await client.send(command);
    const url = this.buildPublicUrl(config, cleanKey);

    return {
      url,
      key: cleanKey,
      filePath: url,
      storageType: 'digitalocean',
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
      logger.debug({ key: cleanKey }, 'Deleted DigitalOcean Spaces file');
    } catch (err) {
      logger.error({ err, key }, 'Failed to delete file from DigitalOcean Spaces');
    }
  }

  async getFileUrl(key: string): Promise<string> {
    if (key.startsWith('http://') || key.startsWith('https://')) return key;
    const config = await this.getConfig();
    const cleanKey = this.cleanKey(key);
    return this.buildPublicUrl(config, cleanKey);
  }

  async getPublicBaseUrl(): Promise<string> {
    const config = await this.getConfig();
    const cleanEndpoint = config.endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `https://${config.bucket}.${cleanEndpoint}`;
  }
}
