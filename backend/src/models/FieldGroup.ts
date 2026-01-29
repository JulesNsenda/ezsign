/**
 * FieldGroup model
 * Represents a group/section of fields within a document
 */

export interface FieldGroupData {
  id: string;
  document_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  collapsed: boolean;
  color: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateFieldGroupData {
  document_id: string;
  name: string;
  description?: string | null;
  sort_order?: number;
  collapsed?: boolean;
  color?: string | null;
}

export interface UpdateFieldGroupData {
  name?: string;
  description?: string | null;
  sort_order?: number;
  collapsed?: boolean;
  color?: string | null;
}

export class FieldGroup {
  id: string;
  document_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  collapsed: boolean;
  color: string | null;
  created_at: Date;
  updated_at: Date;

  constructor(data: FieldGroupData) {
    this.id = data.id;
    this.document_id = data.document_id;
    this.name = data.name;
    this.description = data.description;
    this.sort_order = data.sort_order;
    this.collapsed = data.collapsed;
    this.color = data.color;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  /**
   * Validate group name
   */
  static validateName(name: string): { valid: boolean; error?: string } {
    if (!name || name.trim().length === 0) {
      return { valid: false, error: 'Group name is required' };
    }
    if (name.length > 100) {
      return { valid: false, error: 'Group name must be 100 characters or less' };
    }
    return { valid: true };
  }

  /**
   * Validate hex color format
   */
  static validateColor(color: string | null | undefined): { valid: boolean; error?: string } {
    if (!color) {
      return { valid: true };
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return { valid: false, error: 'Color must be a valid hex color (e.g., #FF0000)' };
    }
    return { valid: true };
  }

  /**
   * Validate description length
   */
  static validateDescription(description: string | null | undefined): { valid: boolean; error?: string } {
    if (!description) {
      return { valid: true };
    }
    if (description.length > 500) {
      return { valid: false, error: 'Description must be 500 characters or less' };
    }
    return { valid: true };
  }

  /**
   * Validate sort order
   */
  static validateSortOrder(sortOrder: number | undefined): { valid: boolean; error?: string } {
    if (sortOrder === undefined) {
      return { valid: true };
    }
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      return { valid: false, error: 'Sort order must be a non-negative integer' };
    }
    return { valid: true };
  }

  /**
   * Validate all create data
   */
  static validateCreateData(data: CreateFieldGroupData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const nameResult = FieldGroup.validateName(data.name);
    if (!nameResult.valid && nameResult.error) {
      errors.push(nameResult.error);
    }

    const colorResult = FieldGroup.validateColor(data.color);
    if (!colorResult.valid && colorResult.error) {
      errors.push(colorResult.error);
    }

    const descResult = FieldGroup.validateDescription(data.description);
    if (!descResult.valid && descResult.error) {
      errors.push(descResult.error);
    }

    const sortResult = FieldGroup.validateSortOrder(data.sort_order);
    if (!sortResult.valid && sortResult.error) {
      errors.push(sortResult.error);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate update data
   */
  static validateUpdateData(data: UpdateFieldGroupData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (data.name !== undefined) {
      const nameResult = FieldGroup.validateName(data.name);
      if (!nameResult.valid && nameResult.error) {
        errors.push(nameResult.error);
      }
    }

    if (data.color !== undefined) {
      const colorResult = FieldGroup.validateColor(data.color);
      if (!colorResult.valid && colorResult.error) {
        errors.push(colorResult.error);
      }
    }

    if (data.description !== undefined) {
      const descResult = FieldGroup.validateDescription(data.description);
      if (!descResult.valid && descResult.error) {
        errors.push(descResult.error);
      }
    }

    if (data.sort_order !== undefined) {
      const sortResult = FieldGroup.validateSortOrder(data.sort_order);
      if (!sortResult.valid && sortResult.error) {
        errors.push(sortResult.error);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check if the group has a custom color
   */
  hasColor(): boolean {
    return this.color !== null && this.color.trim() !== '';
  }

  /**
   * Check if the group has a description
   */
  hasDescription(): boolean {
    return this.description !== null && this.description.trim() !== '';
  }

  /**
   * Get default color for a group (based on sort order for variety)
   */
  static getDefaultColor(sortOrder: number): string {
    const colors = [
      '#3B82F6', // Blue
      '#10B981', // Green
      '#F59E0B', // Amber
      '#EF4444', // Red
      '#8B5CF6', // Purple
      '#EC4899', // Pink
      '#06B6D4', // Cyan
      '#F97316', // Orange
    ];
    return colors[sortOrder % colors.length] || '#3B82F6';
  }

  /**
   * Convert to JSON
   */
  toJSON(): FieldGroupData {
    return {
      id: this.id,
      document_id: this.document_id,
      name: this.name,
      description: this.description,
      sort_order: this.sort_order,
      collapsed: this.collapsed,
      color: this.color,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  /**
   * Convert to public JSON (same as regular JSON for field groups)
   */
  toPublicJSON(): FieldGroupData {
    return this.toJSON();
  }
}
