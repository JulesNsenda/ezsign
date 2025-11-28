export type DocumentStatus = 'draft' | 'pending' | 'completed' | 'cancelled';
export type WorkflowType = 'single' | 'sequential' | 'parallel';

export interface DocumentData {
  id: string;
  user_id: string;
  team_id: string | null;
  title: string;
  original_filename: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  page_count: number;
  status: DocumentStatus;
  workflow_type: WorkflowType;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Thumbnail fields
  thumbnail_path: string | null;
  thumbnail_generated_at: Date | null;
  // Optimization fields
  is_optimized: boolean;
  original_file_size: number | null;
  optimized_at: Date | null;
}

export interface CreateDocumentData {
  user_id: string;
  team_id?: string | null;
  title: string;
  original_filename: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  workflow_type?: WorkflowType;
}

export interface UpdateDocumentData {
  title?: string;
  status?: DocumentStatus;
  workflow_type?: WorkflowType;
  team_id?: string | null;
}

export class Document {
  id: string;
  user_id: string;
  team_id: string | null;
  title: string;
  original_filename: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  page_count: number;
  status: DocumentStatus;
  workflow_type: WorkflowType;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Thumbnail fields
  thumbnail_path: string | null;
  thumbnail_generated_at: Date | null;
  // Optimization fields
  is_optimized: boolean;
  original_file_size: number | null;
  optimized_at: Date | null;

  constructor(data: DocumentData) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.team_id = data.team_id;
    this.title = data.title;
    this.original_filename = data.original_filename;

    // Parse file_path if it's a JSON object
    let filePath = data.file_path;
    if (typeof filePath === 'object' && filePath !== null) {
      // If it's already an object (PostgreSQL JSONB), extract storedPath
      filePath = (filePath as any).storedPath || (filePath as any).file_path || filePath;
    } else if (typeof filePath === 'string') {
      try {
        // Try to parse as JSON string
        const parsed = JSON.parse(filePath);
        filePath = parsed.storedPath || parsed.file_path || filePath;
      } catch {
        // If parsing fails, it's already a plain string path
      }
    }
    this.file_path = filePath as string;

    this.file_size = data.file_size;
    this.mime_type = data.mime_type;
    this.page_count = data.page_count;
    this.status = data.status;
    this.workflow_type = data.workflow_type;
    this.completed_at = data.completed_at;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    // Thumbnail fields
    this.thumbnail_path = data.thumbnail_path;
    this.thumbnail_generated_at = data.thumbnail_generated_at;
    // Optimization fields
    this.is_optimized = data.is_optimized ?? false;
    this.original_file_size = data.original_file_size;
    this.optimized_at = data.optimized_at;
  }

  /**
   * Check if document is in draft status
   */
  isDraft(): boolean {
    return this.status === 'draft';
  }

  /**
   * Check if document is pending signatures
   */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Check if document is completed
   */
  isCompleted(): boolean {
    return this.status === 'completed';
  }

  /**
   * Check if document is cancelled
   */
  isCancelled(): boolean {
    return this.status === 'cancelled';
  }

  /**
   * Check if document can be edited
   * Only draft documents can be edited
   */
  canEdit(): boolean {
    return this.status === 'draft';
  }

  /**
   * Check if document can be sent for signature
   * Only draft documents can be sent
   */
  canSend(): boolean {
    return this.status === 'draft';
  }

  /**
   * Check if document can be cancelled
   * Only pending documents can be cancelled
   */
  canCancel(): boolean {
    return this.status === 'pending';
  }

  /**
   * Mark document as pending (sent for signature)
   */
  markAsPending(): void {
    if (!this.canSend()) {
      throw new Error('Document cannot be sent in its current state');
    }
    this.status = 'pending';
  }

  /**
   * Mark document as completed
   */
  markAsCompleted(): void {
    if (this.status !== 'pending') {
      throw new Error('Only pending documents can be marked as completed');
    }
    this.status = 'completed';
    this.completed_at = new Date();
  }

  /**
   * Mark document as cancelled
   */
  markAsCancelled(): void {
    if (!this.canCancel()) {
      throw new Error('Document cannot be cancelled in its current state');
    }
    this.status = 'cancelled';
  }

  /**
   * Get formatted file size
   */
  getFormattedFileSize(): string {
    const bytes = this.file_size;
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Check if document is a PDF
   */
  isPdf(): boolean {
    return this.mime_type === 'application/pdf';
  }

  /**
   * Get workflow description
   */
  getWorkflowDescription(): string {
    switch (this.workflow_type) {
      case 'single':
        return 'Single signer';
      case 'sequential':
        return 'Sequential signing (signers in order)';
      case 'parallel':
        return 'Parallel signing (any order)';
      default:
        return 'Unknown workflow';
    }
  }

  /**
   * Validate status transition
   */
  static isValidStatusTransition(
    currentStatus: DocumentStatus,
    newStatus: DocumentStatus
  ): boolean {
    const validTransitions: Record<DocumentStatus, DocumentStatus[]> = {
      draft: ['pending'],
      pending: ['completed', 'cancelled'],
      completed: [], // Completed documents cannot transition
      cancelled: [], // Cancelled documents cannot transition
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  /**
   * Validate workflow type
   */
  static isValidWorkflowType(workflowType: string): workflowType is WorkflowType {
    return ['single', 'sequential', 'parallel'].includes(workflowType);
  }

  /**
   * Validate document status
   */
  static isValidStatus(status: string): status is DocumentStatus {
    return ['draft', 'pending', 'completed', 'cancelled'].includes(status);
  }

  /**
   * Check if thumbnail exists
   */
  hasThumbnail(): boolean {
    return !!this.thumbnail_path;
  }

  /**
   * Get optimization savings in bytes
   */
  getOptimizationSavings(): number {
    if (!this.is_optimized || !this.original_file_size) {
      return 0;
    }
    return this.original_file_size - this.file_size;
  }

  /**
   * Get optimization savings percentage
   */
  getOptimizationPercentage(): number {
    if (!this.is_optimized || !this.original_file_size || this.original_file_size === 0) {
      return 0;
    }
    return Math.round(((this.original_file_size - this.file_size) / this.original_file_size) * 100);
  }

  /**
   * Convert to JSON
   */
  toJSON(): DocumentData {
    return {
      id: this.id,
      user_id: this.user_id,
      team_id: this.team_id,
      title: this.title,
      original_filename: this.original_filename,
      file_path: this.file_path,
      file_size: this.file_size,
      mime_type: this.mime_type,
      page_count: this.page_count,
      status: this.status,
      workflow_type: this.workflow_type,
      completed_at: this.completed_at,
      created_at: this.created_at,
      updated_at: this.updated_at,
      thumbnail_path: this.thumbnail_path,
      thumbnail_generated_at: this.thumbnail_generated_at,
      is_optimized: this.is_optimized,
      original_file_size: this.original_file_size,
      optimized_at: this.optimized_at,
    };
  }

  /**
   * Convert to public JSON (exclude internal paths)
   */
  toPublicJSON(): Omit<DocumentData, 'file_path' | 'thumbnail_path'> & {
    file_size_formatted: string;
    has_thumbnail: boolean;
    optimization_savings?: number;
    optimization_percentage?: number;
  } {
    const result: any = {
      id: this.id,
      user_id: this.user_id,
      team_id: this.team_id,
      title: this.title,
      original_filename: this.original_filename,
      file_size: this.file_size,
      file_size_formatted: this.getFormattedFileSize(),
      mime_type: this.mime_type,
      page_count: this.page_count,
      status: this.status,
      workflow_type: this.workflow_type,
      completed_at: this.completed_at,
      created_at: this.created_at,
      updated_at: this.updated_at,
      thumbnail_generated_at: this.thumbnail_generated_at,
      has_thumbnail: this.hasThumbnail(),
      is_optimized: this.is_optimized,
      original_file_size: this.original_file_size,
      optimized_at: this.optimized_at,
    };

    if (this.is_optimized) {
      result.optimization_savings = this.getOptimizationSavings();
      result.optimization_percentage = this.getOptimizationPercentage();
    }

    return result;
  }
}
