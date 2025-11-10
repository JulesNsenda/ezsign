export type FieldType = 'signature' | 'initials' | 'date' | 'text' | 'checkbox';

export interface FieldProperties {
  // Text field properties
  placeholder?: string;
  fontSize?: number;
  fontFamily?: string;
  textColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  maxLength?: number;

  // Checkbox properties
  checked?: boolean;

  // Date field properties
  dateFormat?: string; // e.g., 'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'

  // Signature/Initials properties
  signatureColor?: string;

  // General properties
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  readonly?: boolean;
}

export interface FieldData {
  id: string;
  document_id: string;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  signer_email: string | null;
  properties: FieldProperties | null;
  created_at: Date;
}

export interface CreateFieldData {
  document_id: string;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required?: boolean;
  signer_email?: string | null;
  properties?: FieldProperties | null;
}

export interface UpdateFieldData {
  type?: FieldType;
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  required?: boolean;
  signer_email?: string | null;
  properties?: FieldProperties | null;
}

export class Field {
  id: string;
  document_id: string;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  signer_email: string | null;
  properties: FieldProperties | null;
  created_at: Date;

  constructor(data: FieldData) {
    this.id = data.id;
    this.document_id = data.document_id;
    this.type = data.type;
    this.page = data.page;
    this.x = data.x;
    this.y = data.y;
    this.width = data.width;
    this.height = data.height;
    this.required = data.required;
    this.signer_email = data.signer_email;
    this.properties = data.properties;
    this.created_at = data.created_at;
  }

  /**
   * Check if field is a signature field
   */
  isSignature(): boolean {
    return this.type === 'signature';
  }

  /**
   * Check if field is an initials field
   */
  isInitials(): boolean {
    return this.type === 'initials';
  }

  /**
   * Check if field is a date field
   */
  isDate(): boolean {
    return this.type === 'date';
  }

  /**
   * Check if field is a text field
   */
  isText(): boolean {
    return this.type === 'text';
  }

  /**
   * Check if field is a checkbox field
   */
  isCheckbox(): boolean {
    return this.type === 'checkbox';
  }

  /**
   * Check if field requires a signature (signature or initials)
   */
  requiresSignature(): boolean {
    return this.type === 'signature' || this.type === 'initials';
  }

  /**
   * Check if field has an assigned signer
   */
  hasAssignedSigner(): boolean {
    return this.signer_email !== null && this.signer_email.trim() !== '';
  }

  /**
   * Validate field position and dimensions
   */
  validateBounds(
    pageWidth: number,
    pageHeight: number,
  ): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check if page number is valid (0-indexed)
    if (this.page < 0) {
      errors.push('Page number must be 0 or greater');
    }

    // Check if coordinates are positive
    if (this.x < 0) {
      errors.push('X coordinate must be 0 or greater');
    }
    if (this.y < 0) {
      errors.push('Y coordinate must be 0 or greater');
    }

    // Check if dimensions are positive
    if (this.width <= 0) {
      errors.push('Width must be greater than 0');
    }
    if (this.height <= 0) {
      errors.push('Height must be greater than 0');
    }

    // Check if field fits within page bounds
    if (this.x + this.width > pageWidth) {
      errors.push(`Field extends beyond page width (${this.x + this.width} > ${pageWidth})`);
    }
    if (this.y + this.height > pageHeight) {
      errors.push(`Field extends beyond page height (${this.y + this.height} > ${pageHeight})`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate field type-specific properties
   */
  validateProperties(): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!this.properties) {
      return { valid: true, errors: [] };
    }

    const props = this.properties;

    // Validate text field properties
    if (this.isText()) {
      if (props.maxLength !== undefined && props.maxLength <= 0) {
        errors.push('maxLength must be greater than 0');
      }
      if (props.fontSize !== undefined && props.fontSize <= 0) {
        errors.push('fontSize must be greater than 0');
      }
    }

    // Validate date format if provided
    if (this.isDate() && props.dateFormat) {
      const validFormats = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'MM-DD-YYYY', 'DD-MM-YYYY'];
      if (!validFormats.includes(props.dateFormat)) {
        errors.push(`dateFormat must be one of: ${validFormats.join(', ')}`);
      }
    }

    // Validate color formats (basic hex validation)
    const colorProps = ['textColor', 'signatureColor', 'backgroundColor', 'borderColor'];
    for (const colorProp of colorProps) {
      const color = props[colorProp as keyof FieldProperties];
      if (color && typeof color === 'string' && !this.isValidColor(color)) {
        errors.push(`${colorProp} must be a valid hex color (e.g., #000000)`);
      }
    }

    // Validate border width
    if (props.borderWidth !== undefined && props.borderWidth < 0) {
      errors.push('borderWidth must be 0 or greater');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate hex color format
   */
  private isValidColor(color: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
  }

  /**
   * Get default properties for field type
   */
  static getDefaultProperties(type: FieldType): FieldProperties {
    switch (type) {
      case 'signature':
      case 'initials':
        return {
          signatureColor: '#000000',
          backgroundColor: '#FFFFFF',
          borderColor: '#000000',
          borderWidth: 1,
        };
      case 'date':
        return {
          dateFormat: 'MM/DD/YYYY',
          fontSize: 12,
          fontFamily: 'Helvetica',
          textColor: '#000000',
          textAlign: 'left',
          backgroundColor: '#FFFFFF',
          borderColor: '#000000',
          borderWidth: 1,
        };
      case 'text':
        return {
          placeholder: '',
          fontSize: 12,
          fontFamily: 'Helvetica',
          textColor: '#000000',
          textAlign: 'left',
          maxLength: 255,
          backgroundColor: '#FFFFFF',
          borderColor: '#000000',
          borderWidth: 1,
        };
      case 'checkbox':
        return {
          checked: false,
          backgroundColor: '#FFFFFF',
          borderColor: '#000000',
          borderWidth: 1,
        };
      default:
        return {};
    }
  }

  /**
   * Validate field type
   */
  static isValidFieldType(type: string): type is FieldType {
    return ['signature', 'initials', 'date', 'text', 'checkbox'].includes(type);
  }

  /**
   * Get minimum dimensions for field type (in points)
   */
  static getMinimumDimensions(type: FieldType): { width: number; height: number } {
    switch (type) {
      case 'signature':
        return { width: 150, height: 50 };
      case 'initials':
        return { width: 50, height: 50 };
      case 'date':
        return { width: 100, height: 25 };
      case 'text':
        return { width: 100, height: 25 };
      case 'checkbox':
        return { width: 15, height: 15 };
      default:
        return { width: 50, height: 25 };
    }
  }

  /**
   * Check if field meets minimum size requirements
   */
  meetsMinimumSize(): boolean {
    const minDimensions = Field.getMinimumDimensions(this.type);
    return this.width >= minDimensions.width && this.height >= minDimensions.height;
  }

  /**
   * Get field description for display
   */
  getDescription(): string {
    const typeDescriptions: Record<FieldType, string> = {
      signature: 'Signature',
      initials: 'Initials',
      date: 'Date',
      text: 'Text Input',
      checkbox: 'Checkbox',
    };
    return typeDescriptions[this.type] || 'Unknown Field';
  }

  /**
   * Convert to JSON
   */
  toJSON(): FieldData {
    return {
      id: this.id,
      document_id: this.document_id,
      type: this.type,
      page: this.page,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      required: this.required,
      signer_email: this.signer_email,
      properties: this.properties,
      created_at: this.created_at,
    };
  }

  /**
   * Convert to public JSON (same as regular JSON for fields)
   */
  toPublicJSON(): FieldData {
    return this.toJSON();
  }
}
