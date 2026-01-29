export type DocumentStatus = 'draft' | 'scheduled' | 'pending' | 'completed' | 'cancelled';
export type WorkflowType = 'single' | 'sequential' | 'parallel';

export interface ReminderSettings {
  enabled: boolean;
  intervals: number[]; // Days before expiration (e.g., [1, 3, 7])
}

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
  // Expiration and reminder fields
  expires_at: Date | null;
  reminder_settings: ReminderSettings;
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
  expires_at?: Date | null;
  reminder_settings?: ReminderSettings;
}

export interface UpdateDocumentData {
  title?: string;
  status?: DocumentStatus;
  workflow_type?: WorkflowType;
  team_id?: string | null;
  expires_at?: Date | null;
  reminder_settings?: ReminderSettings;
}

const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  intervals: [1, 3, 7],
};

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
  // Expiration and reminder fields
  expires_at: Date | null;
  reminder_settings: ReminderSettings;

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
    // Expiration and reminder fields
    this.expires_at = data.expires_at;
    this.reminder_settings = data.reminder_settings ?? DEFAULT_REMINDER_SETTINGS;
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
      draft: ['scheduled', 'pending'],
      scheduled: ['draft', 'pending'], // Can cancel back to draft or proceed to pending
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
    return ['draft', 'scheduled', 'pending', 'completed', 'cancelled'].includes(status);
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
   * Check if document has an expiration date
   */
  hasExpiration(): boolean {
    return !!this.expires_at;
  }

  /**
   * Check if document is expired
   */
  isExpired(): boolean {
    if (!this.expires_at) {
      return false;
    }
    return new Date() > this.expires_at;
  }

  /**
   * Get days until expiration (negative if expired)
   */
  getDaysUntilExpiration(): number | null {
    if (!this.expires_at) {
      return null;
    }
    const now = new Date();
    const diffMs = this.expires_at.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if reminders are enabled for this document
   */
  hasRemindersEnabled(): boolean {
    return this.reminder_settings?.enabled ?? true;
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
      expires_at: this.expires_at,
      reminder_settings: this.reminder_settings,
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
    is_expired?: boolean;
    days_until_expiration?: number | null;
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
      expires_at: this.expires_at,
      reminder_settings: this.reminder_settings,
    };

    if (this.is_optimized) {
      result.optimization_savings = this.getOptimizationSavings();
      result.optimization_percentage = this.getOptimizationPercentage();
    }

    if (this.expires_at) {
      result.is_expired = this.isExpired();
      result.days_until_expiration = this.getDaysUntilExpiration();
    }

    return result;
  }
}
