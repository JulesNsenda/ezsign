import apiClient from '@/api/client';
import type { Field } from '@/types';

/**
 * Field service
 * Handles all field-related API calls
 */

export interface CreateFieldData {
  type: 'signature' | 'initials' | 'date' | 'text' | 'checkbox';
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required?: boolean;
  signer_email?: string;
  properties?: Record<string, any>;
}

export interface UpdateFieldData {
  type?: 'signature' | 'initials' | 'date' | 'text' | 'checkbox';
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  required?: boolean;
  signer_email?: string;
  properties?: Record<string, any>;
}

export const fieldService = {
  /**
   * Create a new field
   */
  async create(documentId: string, data: CreateFieldData): Promise<Field> {
    const response = await apiClient.post<{ field: Field }>(
      `/documents/${documentId}/fields`,
      data,
    );
    return response.data.field;
  },

  /**
   * List all fields for a document
   */
  async list(documentId: string): Promise<Field[]> {
    const response = await apiClient.get<{ success: boolean; data: Field[] }>(
      `/documents/${documentId}/fields`,
    );
    return response.data.data || [];
  },

  /**
   * Get a single field by ID
   */
  async getById(documentId: string, fieldId: string): Promise<Field> {
    const response = await apiClient.get<{ field: Field }>(
      `/documents/${documentId}/fields/${fieldId}`,
    );
    return response.data.field;
  },

  /**
   * Update a field
   */
  async update(documentId: string, fieldId: string, data: UpdateFieldData): Promise<Field> {
    const response = await apiClient.put<{ field: Field }>(
      `/documents/${documentId}/fields/${fieldId}`,
      data,
    );
    return response.data.field;
  },

  /**
   * Delete a field
   */
  async delete(documentId: string, fieldId: string): Promise<void> {
    await apiClient.delete(`/documents/${documentId}/fields/${fieldId}`);
  },
};

export default fieldService;
