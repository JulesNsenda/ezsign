import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import {
  StorageAdapter,
  StorageOptions,
  FileMetadata,
} from '@/services/storageService';
import logger from '@/services/loggerService';

export interface S3Config {
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

/**
 * AWS S3 storage adapter
 * Stores files in Amazon S3 or S3-compatible storage (MinIO, DigitalOcean Spaces, etc.)
 */
export class S3StorageAdapter implements StorageAdapter {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;

    const clientConfig: {
      region: string;
      credentials?: { accessKeyId: string; secretAccessKey: string };
      endpoint?: string;
      forcePathStyle?: boolean;
    } = {
      region: config.region,
    };

    // Add credentials if provided (otherwise uses default credential chain)
    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }

    // Custom endpoint for S3-compatible services
    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
      clientConfig.forcePathStyle = config.forcePathStyle ?? true;
    }

    this.client = new S3Client(clientConfig);

    logger.info('S3 storage adapter initialized', {
      bucket: this.bucket,
      region: config.region,
      hasCustomEndpoint: !!config.endpoint,
    });
  }

  /**
   * Save a file to S3
   */
  async save(
    buffer: Buffer,
    filename: string,
    options?: StorageOptions
  ): Promise<string> {
    let key = filename;

    if (options?.directory) {
      key = `${options.directory}/${filename}`;
    }

    if (options?.generateUniqueName) {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 15);
      const ext = this.getExtension(filename);
      const basename = this.getBasename(filename);
      const sanitized = basename.replace(/[^a-zA-Z0-9-_]/g, '_');
      const uniqueName = `${sanitized}-${timestamp}-${random}${ext}`;

      key = options.directory ? `${options.directory}/${uniqueName}` : uniqueName;
    }

    // Normalize key (no leading slashes, forward slashes only)
    key = key.replace(/\\/g, '/').replace(/^\/+/, '');

    const metadata = options?.metadata || {};

    // Use Upload for larger files (supports multipart upload)
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: this.getMimeType(filename),
        Metadata: metadata,
      },
    });

    await upload.done();

    logger.debug('File saved to S3', { bucket: this.bucket, key });

    return key;
  }

  /**
   * Read a file from S3
   */
  async read(path: string): Promise<Buffer> {
    const key = this.normalizeKey(path);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        throw new Error(`File not found: ${path}`);
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      const stream = response.Body as AsyncIterable<Uint8Array>;

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
        throw new Error(`File not found: ${path}`);
      }
      throw error;
    }
  }

  /**
   * Delete a file from S3
   */
  async delete(path: string): Promise<boolean> {
    const key = this.normalizeKey(path);

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);

      logger.debug('File deleted from S3', { bucket: this.bucket, key });

      return true;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Check if a file exists in S3
   */
  async exists(path: string): Promise<boolean> {
    const key = this.normalizeKey(path);

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'NotFound') {
        return false;
      }
      // For other errors, assume file doesn't exist
      return false;
    }
  }

  /**
   * Get file metadata from S3
   */
  async getMetadata(path: string): Promise<FileMetadata> {
    const key = this.normalizeKey(path);

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      return {
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        mimeType: response.ContentType,
        metadata: response.Metadata,
      };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'NotFound') {
        throw new Error(`File not found: ${path}`);
      }
      throw error;
    }
  }

  /**
   * Copy a file within S3
   */
  async copy(sourcePath: string, destPath: string): Promise<string> {
    const sourceKey = this.normalizeKey(sourcePath);
    const destKey = this.normalizeKey(destPath);

    const command = new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${sourceKey}`,
      Key: destKey,
    });

    await this.client.send(command);

    logger.debug('File copied in S3', {
      bucket: this.bucket,
      from: sourceKey,
      to: destKey,
    });

    return destKey;
  }

  /**
   * Move a file within S3 (copy then delete)
   */
  async move(sourcePath: string, destPath: string): Promise<string> {
    await this.copy(sourcePath, destPath);
    await this.delete(sourcePath);

    return this.normalizeKey(destPath);
  }

  /**
   * Normalize key (remove leading slashes, use forward slashes)
   */
  private normalizeKey(path: string): string {
    return path.replace(/\\/g, '/').replace(/^\/+/, '');
  }

  /**
   * Get file extension
   */
  private getExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot !== -1 ? filename.substring(lastDot) : '';
  }

  /**
   * Get filename without extension
   */
  private getBasename(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    const lastSlash = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
    const start = lastSlash !== -1 ? lastSlash + 1 : 0;
    const end = lastDot !== -1 ? lastDot : filename.length;
    return filename.substring(start, end);
  }

  /**
   * Get MIME type from filename
   */
  private getMimeType(filename: string): string {
    const ext = this.getExtension(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}
