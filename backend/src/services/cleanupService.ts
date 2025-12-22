import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import logger from '@/services/loggerService';

/**
 * Storage statistics interface
 */
export interface StorageStats {
  documentsCount: number;
  documentsSize: number;
  tempCount: number;
  tempSize: number;
  signaturesCount: number;
  signaturesSize: number;
  totalSize: number;
}

/**
 * Cleanup result interface
 */
export interface CleanupResult {
  deleted: number;
  errors: number;
  bytesFreed: number;
}

/**
 * Cleanup Service
 * Handles automatic cleanup of orphaned files and temp files
 */
export class CleanupService {
  private pool: Pool;
  private basePath: string;

  constructor(pool: Pool, basePath?: string) {
    this.pool = pool;
    this.basePath = basePath || process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
  }

  /**
   * Get the documents directory path
   */
  getDocumentsDir(): string {
    return path.join(this.basePath, 'documents');
  }

  /**
   * Get the temp directory path
   */
  getTempDir(): string {
    return path.join(this.basePath, 'temp');
  }

  /**
   * Get the signatures directory path
   */
  getSignaturesDir(): string {
    return path.join(this.basePath, 'signatures');
  }

  /**
   * Get the base storage path
   */
  getBasePath(): string {
    return this.basePath;
  }

  /**
   * Clean up temp files older than specified age
   */
  async cleanupTempFiles(maxAgeHours: number = 24): Promise<CleanupResult> {
    const tempDir = this.getTempDir();
    const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    let deleted = 0;
    let errors = 0;
    let bytesFreed = 0;

    logger.info('Starting temp file cleanup', { tempDir, maxAgeHours });

    try {
      const files = await this.scanDirectory(tempDir);

      for (const filePath of files) {
        try {
          const stats = await fs.stat(filePath);

          if (stats.mtimeMs < cutoffTime) {
            bytesFreed += stats.size;
            await fs.unlink(filePath);
            deleted++;
            logger.debug('Deleted temp file', {
              file: filePath,
              ageHours: Math.round((Date.now() - stats.mtimeMs) / (60 * 60 * 1000))
            });
          }
        } catch (err) {
          errors++;
          logger.error('Failed to delete temp file', {
            file: filePath,
            error: (err as Error).message
          });
        }
      }
    } catch (err) {
      logger.error('Failed to read temp directory', {
        tempDir,
        error: (err as Error).message
      });
    }

    logger.info('Temp file cleanup completed', { deleted, errors, bytesFreed });
    return { deleted, errors, bytesFreed };
  }

  /**
   * Find and remove orphaned document files (files without DB record)
   */
  async cleanupOrphanedDocumentFiles(): Promise<CleanupResult> {
    const documentsDir = this.getDocumentsDir();
    let deleted = 0;
    let errors = 0;
    let bytesFreed = 0;

    logger.info('Starting orphaned document file cleanup', { documentsDir });

    try {
      // Get all document file paths from database
      const result = await this.pool.query('SELECT file_path FROM documents WHERE file_path IS NOT NULL');
      const validPaths = new Set<string>();

      for (const row of result.rows) {
        if (row.file_path) {
          // Store both the raw path and normalized versions
          validPaths.add(row.file_path);
          validPaths.add(row.file_path.replace(/\\/g, '/'));
          validPaths.add(row.file_path.replace(/\//g, '\\'));
        }
      }

      // Scan documents directory
      const files = await this.scanDirectory(documentsDir);

      for (const filePath of files) {
        // Skip metadata files
        if (filePath.endsWith('.meta.json')) {
          continue;
        }

        // Get relative path from base storage path
        const relativePath = path.relative(this.basePath, filePath);
        const normalizedPath = relativePath.replace(/\\/g, '/');

        // Check if this file is referenced in the database
        if (!validPaths.has(relativePath) && !validPaths.has(normalizedPath)) {
          try {
            // Check if file is older than 1 hour (avoid deleting files being uploaded)
            const stats = await fs.stat(filePath);
            const oneHourAgo = Date.now() - (60 * 60 * 1000);

            if (stats.mtimeMs < oneHourAgo) {
              bytesFreed += stats.size;
              await fs.unlink(filePath);
              deleted++;
              logger.info('Deleted orphaned document file', { filePath, relativePath });

              // Also try to delete associated metadata file
              try {
                await fs.unlink(`${filePath}.meta.json`);
              } catch {
                // Metadata file might not exist
              }
            }
          } catch (err) {
            errors++;
            logger.error('Failed to delete orphaned file', {
              filePath,
              error: (err as Error).message
            });
          }
        }
      }
    } catch (err) {
      logger.error('Failed to cleanup orphaned document files', {
        error: (err as Error).message
      });
    }

    logger.info('Orphaned document file cleanup completed', { deleted, errors, bytesFreed });
    return { deleted, errors, bytesFreed };
  }

  /**
   * Clean up orphaned signature images
   */
  async cleanupOrphanedSignatures(): Promise<CleanupResult> {
    const signaturesDir = this.getSignaturesDir();
    let deleted = 0;
    let errors = 0;
    let bytesFreed = 0;

    logger.info('Starting orphaned signature cleanup', { signaturesDir });

    try {
      // Get all signature paths from database
      const result = await this.pool.query(
        'SELECT signature_data FROM signatures WHERE signature_data IS NOT NULL'
      );
      const validPaths = new Set<string>();

      for (const row of result.rows) {
        if (row.signature_data) {
          validPaths.add(row.signature_data);
          validPaths.add(row.signature_data.replace(/\\/g, '/'));
          validPaths.add(row.signature_data.replace(/\//g, '\\'));
        }
      }

      const files = await this.scanDirectory(signaturesDir);

      for (const filePath of files) {
        // Skip metadata files
        if (filePath.endsWith('.meta.json')) {
          continue;
        }

        const relativePath = path.relative(this.basePath, filePath);
        const normalizedPath = relativePath.replace(/\\/g, '/');

        if (!validPaths.has(relativePath) && !validPaths.has(normalizedPath)) {
          try {
            const stats = await fs.stat(filePath);
            const oneHourAgo = Date.now() - (60 * 60 * 1000);

            if (stats.mtimeMs < oneHourAgo) {
              bytesFreed += stats.size;
              await fs.unlink(filePath);
              deleted++;
              logger.info('Deleted orphaned signature file', { filePath });
            }
          } catch (err) {
            errors++;
            logger.error('Failed to delete orphaned signature', {
              filePath,
              error: (err as Error).message
            });
          }
        }
      }
    } catch (err) {
      logger.error('Failed to cleanup orphaned signatures', {
        error: (err as Error).message
      });
    }

    logger.info('Orphaned signature cleanup completed', { deleted, errors, bytesFreed });
    return { deleted, errors, bytesFreed };
  }

  /**
   * Delete all files associated with a document
   */
  async deleteDocumentFiles(documentId: string, filePath?: string): Promise<void> {
    logger.info('Deleting document files', { documentId, filePath });

    try {
      // Delete main document file
      if (filePath) {
        const fullPath = path.join(this.basePath, filePath);
        try {
          await fs.unlink(fullPath);
          logger.info('Deleted document file', { documentId, filePath });
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            logger.warn('Failed to delete document file', {
              documentId,
              filePath,
              error: (err as Error).message
            });
          }
        }

        // Try to delete metadata file
        try {
          await fs.unlink(`${fullPath}.meta.json`);
        } catch {
          // Metadata file might not exist
        }
      }

      // Delete any associated signature files
      const result = await this.pool.query(
        'SELECT signature_data FROM signatures WHERE document_id = $1 AND signature_data IS NOT NULL',
        [documentId]
      );

      for (const row of result.rows) {
        if (row.signature_data) {
          try {
            const sigPath = path.join(this.basePath, row.signature_data);
            await fs.unlink(sigPath);
            logger.debug('Deleted signature file', { documentId, signaturePath: row.signature_data });
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
              logger.warn('Failed to delete signature file', {
                documentId,
                signaturePath: row.signature_data,
                error: (err as Error).message,
              });
            }
          }
        }
      }
    } catch (err) {
      logger.error('Failed to delete document files', {
        documentId,
        error: (err as Error).message,
      });
      throw err;
    }
  }

  /**
   * Run full cleanup (temp + orphaned documents + orphaned signatures)
   */
  async runFullCleanup(maxAgeHours: number = 24): Promise<{
    temp: CleanupResult;
    documents: CleanupResult;
    signatures: CleanupResult;
    totalDeleted: number;
    totalBytesFreed: number;
  }> {
    logger.info('Starting full cleanup', { maxAgeHours });

    const temp = await this.cleanupTempFiles(maxAgeHours);
    const documents = await this.cleanupOrphanedDocumentFiles();
    const signatures = await this.cleanupOrphanedSignatures();

    const totalDeleted = temp.deleted + documents.deleted + signatures.deleted;
    const totalBytesFreed = temp.bytesFreed + documents.bytesFreed + signatures.bytesFreed;

    logger.info('Full cleanup completed', { totalDeleted, totalBytesFreed });

    return {
      temp,
      documents,
      signatures,
      totalDeleted,
      totalBytesFreed,
    };
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    const stats: StorageStats = {
      documentsCount: 0,
      documentsSize: 0,
      tempCount: 0,
      tempSize: 0,
      signaturesCount: 0,
      signaturesSize: 0,
      totalSize: 0,
    };

    const dirs = [
      { dir: this.getDocumentsDir(), countKey: 'documentsCount' as const, sizeKey: 'documentsSize' as const },
      { dir: this.getTempDir(), countKey: 'tempCount' as const, sizeKey: 'tempSize' as const },
      { dir: this.getSignaturesDir(), countKey: 'signaturesCount' as const, sizeKey: 'signaturesSize' as const },
    ];

    for (const { dir, countKey, sizeKey } of dirs) {
      try {
        const files = await this.scanDirectory(dir);
        // Exclude metadata files from count
        const actualFiles = files.filter(f => !f.endsWith('.meta.json'));
        stats[countKey] = actualFiles.length;

        for (const file of actualFiles) {
          try {
            const fileStat = await fs.stat(file);
            stats[sizeKey] += fileStat.size;
          } catch {
            // File might have been deleted
          }
        }
      } catch {
        // Directory might not exist
      }
    }

    stats.totalSize = stats.documentsSize + stats.tempSize + stats.signaturesSize;

    return stats;
  }

  /**
   * Recursively scan a directory and return all file paths
   */
  private async scanDirectory(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...await this.scanDirectory(fullPath));
        } else {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return files;
  }
}
