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

/**
 * Common field properties that apply to most field types
 */
export interface CommonFieldProperties {
  placeholder?: string;
  fontSize?: number;
  textColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  readonly?: boolean;
  defaultValue?: string;  // Can contain template variables like {{signer.name}}, {{today}}
  validation?: ValidationConfig;  // Validation rules for text/textarea fields
}

/**
 * Template variable info for pre-filled fields
 */
export interface TemplateVariable {
  variable: string;
  description: string;
  example: string;
}

/**
 * Preset validation pattern identifiers
 */
export type ValidationPatternPreset =
  | 'email'
  | 'phone_us'
  | 'phone_intl'
  | 'sa_id'
  | 'ssn'
  | 'zip_us'
  | 'postal_ca'
  | 'postal_uk'
  | 'number'
  | 'alpha'
  | 'alphanumeric'
  | 'url'
  | 'date_iso'
  | 'currency'
  | 'custom';

/**
 * Validation configuration for text/textarea fields
 */
export interface ValidationConfig {
  pattern?: ValidationPatternPreset;
  customRegex?: string;
  message?: string;
  mask?: string;
}

/**
 * Complete information about a validation pattern preset
 */
export interface ValidationPatternInfo {
  id: ValidationPatternPreset;
  name: string;
  description: string;
  regex: string;
  mask?: string;
  example: string;
  category: 'contact' | 'identity' | 'location' | 'format' | 'general';
}

/**
 * Visibility rule condition comparison operators
 */
export type VisibilityComparison =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_empty'
  | 'is_empty'
  | 'is_checked'
  | 'is_not_checked';

/**
 * A single visibility condition
 */
export interface VisibilityCondition {
  fieldId: string;
  comparison: VisibilityComparison;
  value?: string | number | boolean;
}

/**
 * Visibility rules for a field
 */
export interface VisibilityRules {
  operator: 'and' | 'or';
  conditions: VisibilityCondition[];
}

/**
 * Calculation formula types
 */
export type CalculationFormula =
  | 'sum'       // Add numeric values from referenced fields
  | 'concat'    // Join text values with optional separator
  | 'today'     // Current date
  | 'count'     // Count non-empty referenced fields
  | 'average'   // Calculate average of numeric fields
  | 'min'       // Minimum of numeric fields
  | 'max';      // Maximum of numeric fields

/**
 * Calculation configuration for computed fields
 */
export interface CalculationConfig {
  formula: CalculationFormula;        // Type of calculation
  fields?: string[];                  // Field IDs to use in calculation
  separator?: string;                 // Separator for concat formula (default: ' ')
  format?: 'iso' | 'locale' | 'short';// Date format for today formula
  precision?: number;                 // Decimal places for numeric results
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
  visibility_rules?: VisibilityRules | null;
  calculation?: CalculationConfig | null;
  group_id?: string | null;
  group_sort_order?: number | null;
  created_at: string;
}

export interface FieldGroup {
  id: string;
  document_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  collapsed: boolean;
  color: string | null;
  created_at: string;
  updated_at: string;
  field_count?: number;
}

/**
 * Table column type options
 */
export type TableColumnType = 'text' | 'number' | 'date' | 'checkbox';

/**
 * Column definition for a field table
 */
export interface TableColumn {
  id: string;
  name: string;
  type: TableColumnType;
  width: number;
  required: boolean;
  placeholder?: string;
  defaultValue?: string;
}

/**
 * Row values for a field table (maps column ID to value)
 */
export interface TableRowValues {
  [columnId: string]: string | number | boolean | null;
}

/**
 * Table row data
 */
export interface TableRow {
  id: string;
  table_id: string;
  row_index: number;
  values: TableRowValues;
  created_at: string;
  updated_at: string;
}

/**
 * Field table data
 */
export interface FieldTable {
  id: string;
  document_id: string;
  name: string;
  description: string | null;
  page: number;
  x: number;
  y: number;
  width: number;
  columns: TableColumn[];
  min_rows: number;
  max_rows: number;
  row_height: number;
  show_header: boolean;
  header_background_color: string | null;
  header_text_color: string | null;
  font_size: number;
  border_color: string | null;
  signer_email: string | null;
  allow_add_rows: boolean;
  allow_remove_rows: boolean;
  created_at: string;
  updated_at: string;
  rows?: TableRow[];
}

/**
 * Data for creating a new table
 */
export interface CreateFieldTableData {
  name: string;
  description?: string;
  page: number;
  x: number;
  y: number;
  width: number;
  columns?: TableColumn[];
  min_rows?: number;
  max_rows?: number;
  row_height?: number;
  show_header?: boolean;
  header_background_color?: string;
  header_text_color?: string;
  font_size?: number;
  border_color?: string;
  signer_email?: string;
  allow_add_rows?: boolean;
  allow_remove_rows?: boolean;
}

/**
 * Data for updating a table
 */
export interface UpdateFieldTableData {
  name?: string;
  description?: string;
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  columns?: TableColumn[];
  min_rows?: number;
  max_rows?: number;
  row_height?: number;
  show_header?: boolean;
  header_background_color?: string;
  header_text_color?: string;
  font_size?: number;
  border_color?: string;
  signer_email?: string;
  allow_add_rows?: boolean;
  allow_remove_rows?: boolean;
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
  text_value?: string;
  checkbox_value?: boolean;
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

/**
 * Team interface
 */
export interface Team {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  role?: string; // Added when fetching for user
}

/**
 * Team branding settings
 */
export interface Branding {
  id: string;
  team_id: string;
  // Logo settings
  logo_path?: string | null;
  logo_url?: string | null;
  favicon_path?: string | null;
  // Color settings
  primary_color: string;
  secondary_color: string;
  accent_color?: string | null;
  // Text settings
  company_name?: string | null;
  tagline?: string | null;
  email_footer_text?: string | null;
  // Page customization
  custom_page_title?: string | null;
  support_email?: string | null;
  support_url?: string | null;
  privacy_url?: string | null;
  terms_url?: string | null;
  // Display options
  show_powered_by: boolean;
  hide_ezsign_branding: boolean;
  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Public branding data (used on signing pages)
 */
export interface PublicBranding {
  team_id: string;
  logo_url?: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color?: string | null;
  company_name?: string | null;
  tagline?: string | null;
  custom_page_title?: string | null;
  support_email?: string | null;
  support_url?: string | null;
  privacy_url?: string | null;
  terms_url?: string | null;
  show_powered_by: boolean;
  hide_ezsign_branding?: boolean;
}

/**
 * Branding update data
 */
export interface UpdateBrandingData {
  logo_path?: string | null;
  logo_url?: string | null;
  favicon_path?: string | null;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string | null;
  company_name?: string | null;
  tagline?: string | null;
  email_footer_text?: string | null;
  custom_page_title?: string | null;
  support_email?: string | null;
  support_url?: string | null;
  privacy_url?: string | null;
  terms_url?: string | null;
  show_powered_by?: boolean;
  hide_ezsign_branding?: boolean;
}

/**
 * Default branding values
 */
export const DEFAULT_BRANDING: Partial<Branding> = {
  primary_color: '#4F46E5',
  secondary_color: '#10B981',
  show_powered_by: true,
  hide_ezsign_branding: false,
};
