/**
 * Common types used across the application
 */

export interface User {
  id: string;
  email: string;
  role: 'user' | 'admin';
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface AuthResponse {
  message?: string;
  user: User;
  accessToken: string;
  refreshToken: string;
  // 2FA fields
  twoFactorRequired?: boolean;
  twoFactorToken?: string;
  userId?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export type DocumentStatus = 'draft' | 'scheduled' | 'pending' | 'completed' | 'cancelled';
export type WorkflowType = 'single' | 'sequential' | 'parallel';
export type FieldType = 'signature' | 'initials' | 'date' | 'text' | 'checkbox' | 'radio' | 'dropdown' | 'textarea';
export type SignatureType = 'drawn' | 'typed' | 'uploaded';

export interface RadioOption {
  label: string;
  value: string;
}

export interface RadioFieldProperties {
  options: RadioOption[];
  selectedValue?: string;
  orientation: 'horizontal' | 'vertical';
  fontSize?: number;
  textColor?: string;
  optionSpacing?: number;
}

export interface DropdownFieldProperties {
  options: RadioOption[];
  selectedValue?: string;
  placeholder?: string;
  fontSize?: number;
  textColor?: string;
  backgroundColor?: string;
  borderColor?: string;
}

export interface TextareaFieldProperties {
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  fontSize?: number;
  textColor?: string;
  backgroundColor?: string;
  borderColor?: string;
}

export interface Document {
  id: string;
  user_id: string;
  team_id?: string;
  title: string;
  original_filename: string;
  file_path: string;
  status: DocumentStatus;
  workflow_type: WorkflowType;
  page_count: number;
  file_size: number;
  file_size_formatted?: string;
  mime_type: string;
  created_at: string;
  updated_at: string;
  // Thumbnail fields
  has_thumbnail?: boolean;
  thumbnail_generated_at?: string;
  // Optimization fields
  is_optimized?: boolean;
  original_file_size?: number;
  optimized_at?: string;
  optimization_savings?: number;
  optimization_percentage?: number;
  // Scheduling fields
  scheduled_send_at?: string;
  scheduled_timezone?: string;
}

export interface Field {
  id: string;
  document_id: string;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  signer_email?: string;
  properties?: Record<string, any>;
  created_at: string;
}

export interface Signer {
  id: string;
  document_id: string;
  email: string;
  name: string;
  signing_order?: number;
  status: 'pending' | 'viewed' | 'signed' | 'declined';
  access_token: string;
  signed_at?: string;
  ip_address?: string;
  user_agent?: string;
  role?: string;
  created_at: string;
}

export interface Signature {
  id: string;
  signer_id: string;
  field_id: string;
  signature_type: SignatureType;
  signature_data: string;
  signed_at: string;
  ip_address?: string;
  user_agent?: string;
}

export interface Template {
  id: string;
  user_id: string;
  team_id?: string;
  name: string;
  description?: string;
  original_document_id: string;
  file_path: string;
  created_at: string;
  updated_at: string;
}

export interface AuditEvent {
  id: string;
  document_id: string;
  user_id?: string;
  event_type: string;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  documents?: T[];
  items?: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}
