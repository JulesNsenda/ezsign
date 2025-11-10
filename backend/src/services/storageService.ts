import * as path from 'path';

export interface StorageAdapter {
  /**
   * Save a file to storage
   * @param buffer - File buffer to save
   * @param filename - Name of the file
   * @param options - Additional options
   * @returns The path/key where the file was stored
   */
  save(buffer: Buffer, filename: string, options?: StorageOptions): Promise<string>;

  /**
   * Read a file from storage
   * @param path - Path/key of the file
   * @returns File buffer
   */
  read(path: string): Promise<Buffer>;

  /**
   * Delete a file from storage
   * @param path - Path/key of the file
   * @returns True if deleted successfully
   */
  delete(path: string): Promise<boolean>;

  /**
   * Check if a file exists
   * @param path - Path/key of the file
   * @returns True if file exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Get file metadata
   * @param path - Path/key of the file
   * @returns File metadata
   */
  getMetadata(path: string): Promise<FileMetadata>;

  /**
   * Copy a file within storage
   * @param sourcePath - Source path/key
   * @param destPath - Destination path/key
   * @returns The destination path
   */
  copy(sourcePath: string, destPath: string): Promise<string>;

  /**
   * Move a file within storage
   * @param sourcePath - Source path/key
   * @param destPath - Destination path/key
   * @returns The destination path
   */
  move(sourcePath: string, destPath: string): Promise<string>;
}

export interface StorageOptions {
  /** Directory/prefix for the file */
  directory?: string;
  /** Whether to generate a unique filename */
  generateUniqueName?: boolean;
  /** Metadata to store with the file */
  metadata?: Record<string, string>;
}

export interface FileMetadata {
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType?: string;
  /** Last modified date */
  lastModified: Date;
  /** Custom metadata */
  metadata?: Record<string, string>;
}

export interface UploadedFile {
  /** Original filename */
  originalName: string;
  /** Stored filename/path */
  storedPath: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
}

/**
 * Storage service for managing file uploads and downloads
 * Provides an abstraction over different storage backends
 */
export class StorageService {
  private adapter: StorageAdapter;

  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
  }

  /**
   * Upload a file
   */
  async uploadFile(
    buffer: Buffer,
    filename: string,
    options?: StorageOptions
  ): Promise<UploadedFile> {
    const storedPath = await this.adapter.save(buffer, filename, options);

    return {
      originalName: filename,
      storedPath,
      size: buffer.length,
      mimeType: this.getMimeType(filename),
    };
  }

  /**
   * Download a file
   */
  async downloadFile(path: string): Promise<Buffer> {
    return this.adapter.read(path);
  }

  /**
   * Delete a file
   */
  async deleteFile(path: string): Promise<boolean> {
    return this.adapter.delete(path);
  }

  /**
   * Check if file exists
   */
  async fileExists(path: string): Promise<boolean> {
    return this.adapter.exists(path);
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(path: string): Promise<FileMetadata> {
    return this.adapter.getMetadata(path);
  }

  /**
   * Copy a file
   */
  async copyFile(sourcePath: string, destPath: string): Promise<string> {
    return this.adapter.copy(sourcePath, destPath);
  }

  /**
   * Move a file
   */
  async moveFile(sourcePath: string, destPath: string): Promise<string> {
    return this.adapter.move(sourcePath, destPath);
  }

  /**
   * Generate a unique filename
   */
  generateUniqueFilename(originalFilename: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const ext = path.extname(originalFilename);
    const basename = path.basename(originalFilename, ext);
    const sanitized = basename.replace(/[^a-zA-Z0-9-_]/g, '_');
    return `${sanitized}-${timestamp}-${random}${ext}`;
  }

  /**
   * Sanitize filename
   */
  sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9-_.]/g, '_');
  }

  /**
   * Get MIME type from filename
   */
  getMimeType(filename: string): string {
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

  /**
   * Validate file size
   */
  validateFileSize(size: number, maxSize: number): boolean {
    return size <= maxSize;
  }

  /**
   * Validate file type
   */
  validateFileType(filename: string, allowedTypes: string[]): boolean {
    const ext = path.extname(filename).toLowerCase();
    return allowedTypes.includes(ext);
  }

  /**
   * Get file extension
   */
  getFileExtension(filename: string): string {
    return path.extname(filename).toLowerCase();
  }

  /**
   * Format file size to human readable
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

/**
 * Create a storage service with the appropriate adapter
 */
export function createStorageService(adapter: StorageAdapter): StorageService {
  return new StorageService(adapter);
}
