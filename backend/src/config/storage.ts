import { LocalStorageAdapter } from '@/adapters/LocalStorageAdapter';
import { S3StorageAdapter, S3Config } from '@/adapters/S3StorageAdapter';
import { StorageAdapter, StorageService, createStorageService } from '@/services/storageService';
import logger from '@/services/loggerService';

export type StorageType = 'local' | 's3';

export interface StorageConfig {
  type: StorageType;
  local?: {
    basePath: string;
  };
  s3?: S3Config;
}

/**
 * Get storage configuration from environment variables
 */
export function getStorageConfig(): StorageConfig {
  const storageType = (process.env.STORAGE_TYPE || 'local') as StorageType;

  if (storageType === 's3') {
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';

    if (!bucket) {
      throw new Error('S3_BUCKET environment variable is required when STORAGE_TYPE=s3');
    }

    return {
      type: 's3',
      s3: {
        bucket,
        region,
        accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      },
    };
  }

  return {
    type: 'local',
    local: {
      basePath: process.env.FILE_STORAGE_PATH || './storage',
    },
  };
}

/**
 * Create the appropriate storage adapter based on configuration
 */
export function createStorageAdapter(config?: StorageConfig): StorageAdapter {
  const storageConfig = config || getStorageConfig();

  if (storageConfig.type === 's3' && storageConfig.s3) {
    logger.info('Using S3 storage adapter', {
      bucket: storageConfig.s3.bucket,
      region: storageConfig.s3.region,
      hasEndpoint: !!storageConfig.s3.endpoint,
    });
    return new S3StorageAdapter(storageConfig.s3);
  }

  const basePath = storageConfig.local?.basePath || './storage';
  logger.info('Using local storage adapter', { basePath });
  return new LocalStorageAdapter(basePath);
}

// Singleton instance for shared use
let sharedStorageService: StorageService | null = null;

/**
 * Get or create a shared storage service instance
 */
export function getStorageService(): StorageService {
  if (!sharedStorageService) {
    const adapter = createStorageAdapter();
    sharedStorageService = createStorageService(adapter);
  }
  return sharedStorageService;
}

/**
 * Reset the shared storage service (useful for testing)
 */
export function resetStorageService(): void {
  sharedStorageService = null;
}
