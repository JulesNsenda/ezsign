import * as path from 'path';
import * as fs from 'fs/promises';
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

// Logged at most once so a hot path resolving the root repeatedly (e.g. per
// request) doesn't flood the logs with the same relocation notice.
let storagePathDivergenceLogged = false;

/**
 * The single canonical local storage root (SEC-C2 prerequisite -- a
 * containment guard anchored on one root cannot constrain modules that
 * resolve a different one). `STORAGE_PATH` is accepted as a deprecated
 * alias of `FILE_STORAGE_PATH`; every module that previously read either
 * env var directly should call this instead.
 *
 * F4/F4b: unifying the two vars behind one function is a real storage-root
 * *relocation* for any instance that had `STORAGE_PATH` set, because before
 * this existed some modules (`documentController`, `pdfController`,
 * `cleanupService`, `pdfWorker`) read `STORAGE_PATH` directly while the main
 * document/template/logo/signed-PDF adapter (`getStorageConfig()`) read
 * only `FILE_STORAGE_PATH` and otherwise defaulted to `<cwd>/storage`. So:
 *  - `STORAGE_PATH` set, `FILE_STORAGE_PATH` unset -- `STORAGE_PATH` is now
 *    honoured everywhere, including the main adapter, which previously
 *    ignored it and defaulted to `<cwd>/storage`. Existing files there are
 *    orphaned.
 *  - Both set, to different values -- `FILE_STORAGE_PATH` wins everywhere
 *    now, including the four modules above that previously read
 *    `STORAGE_PATH` directly. Their effective root silently changes too.
 * Either case must be loud, not a routine deprecation notice: log at error,
 * not warn, and name both roots plus a one-line migration command.
 */
export function getStorageRoot(): string {
  const fileStoragePath = process.env.FILE_STORAGE_PATH;
  const storagePathAlias = process.env.STORAGE_PATH;

  if (storagePathAlias && storagePathAlias !== fileStoragePath && !storagePathDivergenceLogged) {
    storagePathDivergenceLogged = true;

    if (!fileStoragePath) {
      const previousRoot = path.join(process.cwd(), 'storage');
      logger.error(
        'STORAGE_PATH is set (FILE_STORAGE_PATH is not) -- the storage root is relocating for every module, ' +
          'including the main document/template/logo/signed-PDF adapter, which previously ignored STORAGE_PATH ' +
          'and defaulted here. Existing files will 404 as missing until moved.',
        {
          previousRoot,
          newRoot: storagePathAlias,
          migrationCommand: `mv ${previousRoot}/* ${storagePathAlias}/`,
        }
      );
    } else {
      logger.error(
        'STORAGE_PATH and FILE_STORAGE_PATH are both set, to different values -- FILE_STORAGE_PATH wins ' +
          'everywhere now, including modules that previously read STORAGE_PATH directly (documentController, ' +
          'pdfController, cleanupService, pdfWorker). Existing files under STORAGE_PATH will 404 as missing ' +
          'until moved, or unset STORAGE_PATH if this divergence is unintentional.',
        {
          fileStoragePath,
          storagePathAlias,
          migrationCommand: `mv ${storagePathAlias}/* ${fileStoragePath}/`,
        }
      );
    }
  }

  if (fileStoragePath) {
    return fileStoragePath;
  }

  if (storagePathAlias) {
    return storagePathAlias;
  }

  return './storage';
}

/**
 * Prove at STARTUP that the storage root resolves and is writable.
 *
 * Without this the first thing to discover a broken storage root is a user's
 * first upload, as a 500. That is exactly how this bit on DROP: the default
 * root is the RELATIVE `./storage`, Node resolves it against `process.cwd()`,
 * and every upload died with `ENOENT: no such file or directory, mkdir
 * './storage'` - despite `recursive: true` - because the relative path had no
 * usable working directory to anchor to. Nothing in the logs said so until
 * someone tried to upload.
 *
 * Logs the RESOLVED ABSOLUTE path either way, so "where do files actually go"
 * is answerable from the logs alone rather than by reasoning about cwd.
 *
 * Deliberately does NOT exit on failure: the rest of the app (auth, viewing,
 * existing documents) still works, and a hard exit here would crash-loop the
 * container - which is what destroys the one-time bootstrap admin password.
 *
 * @returns true when the root is usable
 */
export async function verifyStorageRoot(): Promise<boolean> {
  const configuredRoot = getStorageRoot();
  let resolvedRoot: string;

  try {
    // process.cwd() itself throws if the working directory is gone, which is
    // the failure this function exists to make legible.
    resolvedRoot = path.resolve(configuredRoot);
  } catch (error) {
    logger.error(
      'Storage root could not be resolved to an absolute path. The configured root is relative and the ' +
        'process has no usable working directory. Set FILE_STORAGE_PATH to an ABSOLUTE path.',
      { configuredRoot, error: (error as Error).message }
    );
    return false;
  }

  const probe = path.join(resolvedRoot, `.write-probe-${process.pid}`);

  try {
    await fs.mkdir(resolvedRoot, { recursive: true });
    await fs.writeFile(probe, 'ok');
    await fs.unlink(probe);
  } catch (error) {
    logger.error(
      'Storage root is NOT writable - every upload will fail. Set FILE_STORAGE_PATH to an absolute, ' +
        'writable path.',
      {
        configuredRoot,
        resolvedRoot,
        isAbsoluteConfig: path.isAbsolute(configuredRoot),
        error: (error as Error).message,
      }
    );
    return false;
  }

  logger.info('Storage root verified writable', { configuredRoot, resolvedRoot });
  return true;
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
      basePath: getStorageRoot(),
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
