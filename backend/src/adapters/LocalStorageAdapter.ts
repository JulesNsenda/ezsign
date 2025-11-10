import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageAdapter, StorageOptions, FileMetadata } from '@/services/storageService';

/**
 * Local filesystem storage adapter
 * Stores files in the local filesystem
 */
export class LocalStorageAdapter implements StorageAdapter {
  private basePath: string;

  /**
   * @param basePath - Base directory for file storage
   */
  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * Initialize the storage directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.access(this.basePath);
    } catch {
      // Directory doesn't exist, create it
      await fs.mkdir(this.basePath, { recursive: true });
    }
  }

  /**
   * Save a file to local storage
   */
  async save(buffer: Buffer, filename: string, options?: StorageOptions): Promise<string> {
    // Ensure base directory exists
    await this.initialize();

    // Build file path
    let relativePath = filename;

    if (options?.directory) {
      relativePath = path.join(options.directory, filename);
    }

    if (options?.generateUniqueName) {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 15);
      const ext = path.extname(filename);
      const basename = path.basename(filename, ext);
      const sanitized = basename.replace(/[^a-zA-Z0-9-_]/g, '_');
      const uniqueName = `${sanitized}-${timestamp}-${random}${ext}`;

      relativePath = options.directory ? path.join(options.directory, uniqueName) : uniqueName;
    }

    const fullPath = path.join(this.basePath, relativePath);

    // Ensure directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(fullPath, buffer);

    // Store metadata if provided
    if (options?.metadata) {
      await this.saveMetadata(relativePath, options.metadata);
    }

    // Return relative path (without basePath)
    return relativePath.replace(/\\/g, '/'); // Normalize to forward slashes
  }

  /**
   * Read a file from local storage
   */
  async read(filePath: string): Promise<Buffer> {
    const fullPath = path.join(this.basePath, filePath);

    try {
      return await fs.readFile(fullPath);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }
  }

  /**
   * Delete a file from local storage
   */
  async delete(filePath: string): Promise<boolean> {
    const fullPath = path.join(this.basePath, filePath);

    try {
      await fs.unlink(fullPath);

      // Also delete metadata file if it exists
      const metadataPath = this.getMetadataPath(filePath);
      try {
        await fs.unlink(metadataPath);
      } catch {
        // Metadata file might not exist, ignore
      }

      return true;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Check if a file exists
   */
  async exists(filePath: string): Promise<boolean> {
    const fullPath = path.join(this.basePath, filePath);

    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata
   */
  async getMetadata(filePath: string): Promise<FileMetadata> {
    const fullPath = path.join(this.basePath, filePath);

    try {
      const stats = await fs.stat(fullPath);

      // Try to read custom metadata
      let customMetadata: Record<string, string> | undefined;
      try {
        customMetadata = await this.readMetadata(filePath);
      } catch {
        // Metadata file might not exist
      }

      return {
        size: stats.size,
        lastModified: stats.mtime,
        mimeType: this.getMimeType(filePath),
        metadata: customMetadata,
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }
  }

  /**
   * Copy a file within storage
   */
  async copy(sourcePath: string, destPath: string): Promise<string> {
    const sourceFullPath = path.join(this.basePath, sourcePath);
    const destFullPath = path.join(this.basePath, destPath);

    // Ensure destination directory exists
    const destDir = path.dirname(destFullPath);
    await fs.mkdir(destDir, { recursive: true });

    // Copy file
    await fs.copyFile(sourceFullPath, destFullPath);

    // Copy metadata if it exists
    try {
      const metadata = await this.readMetadata(sourcePath);
      await this.saveMetadata(destPath, metadata);
    } catch {
      // Metadata might not exist, ignore
    }

    return destPath.replace(/\\/g, '/');
  }

  /**
   * Move a file within storage
   */
  async move(sourcePath: string, destPath: string): Promise<string> {
    const sourceFullPath = path.join(this.basePath, sourcePath);
    const destFullPath = path.join(this.basePath, destPath);

    // Ensure destination directory exists
    const destDir = path.dirname(destFullPath);
    await fs.mkdir(destDir, { recursive: true });

    // Move file
    await fs.rename(sourceFullPath, destFullPath);

    // Move metadata if it exists
    try {
      const sourceMetadataPath = this.getMetadataPath(sourcePath);
      const destMetadataPath = this.getMetadataPath(destPath);
      await fs.rename(sourceMetadataPath, destMetadataPath);
    } catch {
      // Metadata might not exist, ignore
    }

    return destPath.replace(/\\/g, '/');
  }

  /**
   * Get metadata file path
   */
  private getMetadataPath(filePath: string): string {
    return path.join(this.basePath, `${filePath}.meta.json`);
  }

  /**
   * Save metadata to a separate file
   */
  private async saveMetadata(filePath: string, metadata: Record<string, string>): Promise<void> {
    const metadataPath = this.getMetadataPath(filePath);
    const dir = path.dirname(metadataPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Read metadata from file
   */
  private async readMetadata(filePath: string): Promise<Record<string, string>> {
    const metadataPath = this.getMetadataPath(filePath);
    const content = await fs.readFile(metadataPath, 'utf-8');
    return JSON.parse(content) as Record<string, string>;
  }

  /**
   * Get MIME type from filename
   */
  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
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
