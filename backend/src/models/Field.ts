export type FieldType = 'signature' | 'initials' | 'date' | 'text' | 'checkbox' | 'radio' | 'dropdown' | 'textarea';

export interface RadioOption {
  label: string;
  value: string;
}

/**
 * Visibility rule condition comparison operators
 */
export type VisibilityComparison =
  | 'equals'         // Field value equals specified value
  | 'not_equals'     // Field value does not equal specified value
  | 'contains'       // Field value contains specified value (text fields)
  | 'not_empty'      // Field has any value
  | 'is_empty'       // Field has no value
  | 'is_checked'     // Checkbox is checked
  | 'is_not_checked'; // Checkbox is not checked

/**
 * A single visibility condition
 */
export interface VisibilityCondition {
  fieldId: string;                   // UUID of the field to check
  comparison: VisibilityComparison;  // How to compare
  value?: string | number | boolean; // Value to compare against (optional for is_checked, not_empty, etc.)
}

/**
 * Visibility rules for a field
 */
export interface VisibilityRules {
  operator: 'and' | 'or';           // How to combine conditions
  conditions: VisibilityCondition[]; // List of conditions to evaluate
}

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
  checkColor?: string; // Color of the check mark (default: #000000)
  style?: 'checkmark' | 'x'; // Check mark style (default: checkmark)

  // Date field properties
  dateFormat?: string; // e.g., 'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'

  // Signature/Initials properties
  signatureColor?: string;

  // Radio field properties
  options?: RadioOption[];
  selectedValue?: string;
  orientation?: 'horizontal' | 'vertical';
  optionSpacing?: number;

  // Dropdown field properties
  // Note: uses 'options', 'selectedValue' (shared with radio) and 'placeholder' (shared with text)

  // Textarea field properties
  rows?: number; // Number of visible text rows (default: 3)
  // Note: also uses 'placeholder', 'maxLength', 'fontSize', 'textColor' from text

  // General properties
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  readonly?: boolean;

  // Pre-fill properties
  defaultValue?: string;  // Can contain template variables like {{signer.name}}, {{today}}
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
  visibility_rules: VisibilityRules | null;
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
  visibility_rules?: VisibilityRules | null;
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
  visibility_rules?: VisibilityRules | null;
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
  visibility_rules: VisibilityRules | null;
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
    this.visibility_rules = data.visibility_rules;
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
   * Check if field is a radio button group
   */
  isRadio(): boolean {
    return this.type === 'radio';
  }

  /**
   * Check if field is a dropdown select field
   */
  isDropdown(): boolean {
    return this.type === 'dropdown';
  }

  /**
   * Check if field is a textarea (multi-line text) field
   */
  isTextarea(): boolean {
    return this.type === 'textarea';
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
  validateBounds(pageWidth: number, pageHeight: number): {
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
      errors.push(
        `Field extends beyond page width (${this.x + this.width} > ${pageWidth})`
      );
    }
    if (this.y + this.height > pageHeight) {
      errors.push(
        `Field extends beyond page height (${this.y + this.height} > ${pageHeight})`
      );
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

    // Validate radio field properties
    if (this.isRadio()) {
      if (!props.options || props.options.length < 2) {
        errors.push('Radio field must have at least 2 options');
      }
      if (props.options && props.options.length > 10) {
        errors.push('Radio field cannot have more than 10 options');
      }
      if (props.options) {
        const values = props.options.map((o) => o.value);
        if (new Set(values).size !== values.length) {
          errors.push('Radio options must have unique values');
        }
        // Check each option has non-empty label and value
        for (const option of props.options) {
          if (!option.label || option.label.trim() === '') {
            errors.push('Radio option labels cannot be empty');
            break;
          }
          if (!option.value || option.value.trim() === '') {
            errors.push('Radio option values cannot be empty');
            break;
          }
        }
        // Validate selectedValue if provided
        if (props.selectedValue && !values.includes(props.selectedValue)) {
          errors.push('Selected value must match one of the radio options');
        }
      }
      // Validate optionSpacing
      if (props.optionSpacing !== undefined && (props.optionSpacing < 10 || props.optionSpacing > 50)) {
        errors.push('Option spacing must be between 10 and 50');
      }
    }

    // Validate dropdown field properties
    if (this.isDropdown()) {
      if (!props.options || props.options.length < 1) {
        errors.push('Dropdown field must have at least 1 option');
      }
      if (props.options && props.options.length > 20) {
        errors.push('Dropdown field cannot have more than 20 options');
      }
      if (props.options) {
        const values = props.options.map((o) => o.value);
        if (new Set(values).size !== values.length) {
          errors.push('Dropdown options must have unique values');
        }
        // Check each option has non-empty label and value
        for (const option of props.options) {
          if (!option.label || option.label.trim() === '') {
            errors.push('Dropdown option labels cannot be empty');
            break;
          }
          if (!option.value || option.value.trim() === '') {
            errors.push('Dropdown option values cannot be empty');
            break;
          }
        }
        // Validate selectedValue if provided
        if (props.selectedValue && !values.includes(props.selectedValue)) {
          errors.push('Selected value must match one of the dropdown options');
        }
      }
    }

    // Validate textarea field properties
    if (this.isTextarea()) {
      if (props.rows !== undefined && (props.rows < 1 || props.rows > 20)) {
        errors.push('Textarea rows must be between 1 and 20');
      }
      if (props.maxLength !== undefined && (props.maxLength < 1 || props.maxLength > 10000)) {
        errors.push('Textarea maxLength must be between 1 and 10000');
      }
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
          checkColor: '#000000',
          borderWidth: 1,
          style: 'checkmark', // 'checkmark' for ✓ or 'x' for X mark
        };
      case 'radio':
        return {
          options: [
            { label: 'Option 1', value: 'option1' },
            { label: 'Option 2', value: 'option2' },
          ],
          selectedValue: undefined,
          orientation: 'vertical',
          fontSize: 12,
          textColor: '#000000',
          optionSpacing: 20,
        };
      case 'dropdown':
        return {
          options: [
            { label: 'Option 1', value: 'option1' },
            { label: 'Option 2', value: 'option2' },
            { label: 'Option 3', value: 'option3' },
          ],
          selectedValue: undefined,
          placeholder: 'Select an option',
          fontSize: 12,
          textColor: '#000000',
          backgroundColor: '#FFFFFF',
          borderColor: '#000000',
          borderWidth: 1,
        };
      case 'textarea':
        return {
          placeholder: '',
          rows: 3,
          fontSize: 12,
          fontFamily: 'Helvetica',
          textColor: '#000000',
          textAlign: 'left',
          maxLength: 1000,
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
    return ['signature', 'initials', 'date', 'text', 'checkbox', 'radio', 'dropdown', 'textarea'].includes(type);
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
      case 'radio':
        return { width: 100, height: 50 }; // Minimum for 2 vertical options
      case 'dropdown':
        return { width: 120, height: 25 };
      case 'textarea':
        return { width: 150, height: 60 }; // Taller for multi-line text
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
      radio: 'Radio Button Group',
      dropdown: 'Dropdown Select',
      textarea: 'Multi-line Text',
    };
    return typeDescriptions[this.type] || 'Unknown Field';
  }

  /**
   * Check if field has visibility rules
   */
  hasVisibilityRules(): boolean {
    return (
      this.visibility_rules !== null &&
      this.visibility_rules.conditions.length > 0
    );
  }

  /**
   * Validate visibility rules
   */
  validateVisibilityRules(allFieldIds: string[]): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!this.visibility_rules) {
      return { valid: true, errors: [] };
    }

    const { operator, conditions } = this.visibility_rules;

    // Validate operator
    if (operator !== 'and' && operator !== 'or') {
      errors.push('Visibility rules operator must be "and" or "or"');
    }

    // Validate conditions
    if (!Array.isArray(conditions) || conditions.length === 0) {
      errors.push('Visibility rules must have at least one condition');
    }

    const validComparisons: VisibilityComparison[] = [
      'equals',
      'not_equals',
      'contains',
      'not_empty',
      'is_empty',
      'is_checked',
      'is_not_checked',
    ];

    for (const condition of conditions) {
      // Check fieldId exists
      if (!condition.fieldId) {
        errors.push('Visibility condition must specify a fieldId');
        continue;
      }

      // Check fieldId refers to a valid field
      if (!allFieldIds.includes(condition.fieldId)) {
        errors.push(`Visibility condition references unknown field: ${condition.fieldId}`);
      }

      // Prevent self-reference
      if (condition.fieldId === this.id) {
        errors.push('Field cannot reference itself in visibility rules');
      }

      // Validate comparison operator
      if (!validComparisons.includes(condition.comparison)) {
        errors.push(`Invalid visibility comparison: ${condition.comparison}`);
      }

      // Validate value is provided for comparisons that require it
      const requiresValue: VisibilityComparison[] = ['equals', 'not_equals', 'contains'];
      if (requiresValue.includes(condition.comparison) && condition.value === undefined) {
        errors.push(`Visibility comparison "${condition.comparison}" requires a value`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
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
      visibility_rules: this.visibility_rules,
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
