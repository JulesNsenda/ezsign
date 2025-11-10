export interface TemplateData {
  id: string;
  user_id: string;
  team_id: string | null;
  name: string;
  description: string | null;
  original_document_id: string | null;
  file_path: string;
  file_size: number;
  mime_type: string;
  page_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTemplateData {
  user_id: string;
  team_id?: string | null;
  name: string;
  description?: string | null;
  original_document_id?: string | null;
  file_path: string;
  file_size: number;
  mime_type: string;
  page_count: number;
}

export interface UpdateTemplateData {
  name?: string;
  description?: string | null;
  team_id?: string | null;
}

export interface TemplateFieldData {
  id: string;
  template_id: string;
  type: 'signature' | 'initials' | 'date' | 'text' | 'checkbox';
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  signer_role: string | null;
  properties: Record<string, any> | null;
  created_at: Date;
}

export interface CreateTemplateFieldData {
  template_id: string;
  type: 'signature' | 'initials' | 'date' | 'text' | 'checkbox';
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required?: boolean;
  signer_role?: string | null;
  properties?: Record<string, any> | null;
}

export class Template {
  id: string;
  user_id: string;
  team_id: string | null;
  name: string;
  description: string | null;
  original_document_id: string | null;
  file_path: string;
  file_size: number;
  mime_type: string;
  page_count: number;
  created_at: Date;
  updated_at: Date;

  constructor(data: TemplateData) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.team_id = data.team_id;
    this.name = data.name;
    this.description = data.description;
    this.original_document_id = data.original_document_id;
    this.file_path = data.file_path;
    this.file_size = data.file_size;
    this.mime_type = data.mime_type;
    this.page_count = data.page_count;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  /**
   * Check if template is owned by a team
   */
  isTeamTemplate(): boolean {
    return this.team_id !== null;
  }

  /**
   * Check if template is a personal template
   */
  isPersonalTemplate(): boolean {
    return this.team_id === null;
  }

  /**
   * Check if template is a PDF
   */
  isPdf(): boolean {
    return this.mime_type === 'application/pdf';
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
   * Check if user can access this template
   */
  canUserAccess(userId: string, userTeamIds: string[]): boolean {
    // Owner can always access
    if (this.user_id === userId) {
      return true;
    }

    // If it's a team template, check if user is in that team
    if (this.team_id && userTeamIds.includes(this.team_id)) {
      return true;
    }

    return false;
  }

  /**
   * Check if user can edit this template
   */
  canUserEdit(userId: string): boolean {
    // Only the owner can edit
    return this.user_id === userId;
  }

  /**
   * Check if user can delete this template
   */
  canUserDelete(userId: string): boolean {
    // Only the owner can delete
    return this.user_id === userId;
  }

  /**
   * Convert to JSON
   */
  toJSON(): TemplateData {
    return {
      id: this.id,
      user_id: this.user_id,
      team_id: this.team_id,
      name: this.name,
      description: this.description,
      original_document_id: this.original_document_id,
      file_path: this.file_path,
      file_size: this.file_size,
      mime_type: this.mime_type,
      page_count: this.page_count,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  /**
   * Convert to public JSON (exclude internal paths)
   */
  toPublicJSON(): Omit<TemplateData, 'file_path'> & { file_size_formatted: string } {
    return {
      id: this.id,
      user_id: this.user_id,
      team_id: this.team_id,
      name: this.name,
      description: this.description,
      original_document_id: this.original_document_id,
      file_size: this.file_size,
      file_size_formatted: this.getFormattedFileSize(),
      mime_type: this.mime_type,
      page_count: this.page_count,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}

export class TemplateField {
  id: string;
  template_id: string;
  type: 'signature' | 'initials' | 'date' | 'text' | 'checkbox';
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  signer_role: string | null;
  properties: Record<string, any> | null;
  created_at: Date;

  constructor(data: TemplateFieldData) {
    this.id = data.id;
    this.template_id = data.template_id;
    this.type = data.type;
    this.page = data.page;
    this.x = data.x;
    this.y = data.y;
    this.width = data.width;
    this.height = data.height;
    this.required = data.required;
    this.signer_role = data.signer_role;
    this.properties = data.properties;
    this.created_at = data.created_at;
  }

  /**
   * Check if field has a signer role assigned
   */
  hasSignerRole(): boolean {
    return this.signer_role !== null && this.signer_role.trim() !== '';
  }

  /**
   * Convert to JSON
   */
  toJSON(): TemplateFieldData {
    return {
      id: this.id,
      template_id: this.template_id,
      type: this.type,
      page: this.page,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      required: this.required,
      signer_role: this.signer_role,
      properties: this.properties,
      created_at: this.created_at,
    };
  }
}
