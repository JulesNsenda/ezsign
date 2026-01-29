import apiClient from '@/api/client';
import type { FieldGroup } from '@/types';

/**
 * Field Group service
 * Handles all field group-related API calls
 */

export interface CreateFieldGroupData {
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

export const fieldGroupService = {
  /**
   * List all field groups for a document
   */
  async list(documentId: string, includeFieldCounts = false): Promise<FieldGroup[]> {
    const params = includeFieldCounts ? '?include_field_counts=true' : '';
    const response = await apiClient.get<{ success: boolean; data: FieldGroup[] }>(
      `/documents/${documentId}/groups${params}`
    );
    return response.data.data || [];
  },

  /**
   * Get a single field group by ID
   */
  async getById(documentId: string, groupId: string): Promise<FieldGroup> {
    const response = await apiClient.get<{ success: boolean; data: FieldGroup }>(
      `/documents/${documentId}/groups/${groupId}`
    );
    return response.data.data;
  },

  /**
   * Create a new field group
   */
  async create(documentId: string, data: CreateFieldGroupData): Promise<FieldGroup> {
    const response = await apiClient.post<{ success: boolean; data: FieldGroup }>(
      `/documents/${documentId}/groups`,
      data
    );
    return response.data.data;
  },

  /**
   * Update a field group
   */
  async update(
    documentId: string,
    groupId: string,
    data: UpdateFieldGroupData
  ): Promise<FieldGroup> {
    const response = await apiClient.put<{ success: boolean; data: FieldGroup }>(
      `/documents/${documentId}/groups/${groupId}`,
      data
    );
    return response.data.data;
  },

  /**
   * Delete a field group
   */
  async delete(documentId: string, groupId: string): Promise<void> {
    await apiClient.delete(`/documents/${documentId}/groups/${groupId}`);
  },

  /**
   * Reorder field groups
   */
  async reorderGroups(documentId: string, groupIds: string[]): Promise<void> {
    await apiClient.post(`/documents/${documentId}/groups/reorder`, { groupIds });
  },

  /**
   * Assign fields to a group
   */
  async assignFieldsToGroup(
    documentId: string,
    groupId: string,
    fieldIds: string[]
  ): Promise<void> {
    await apiClient.post(`/documents/${documentId}/groups/${groupId}/fields`, {
      fieldIds,
    });
  },

  /**
   * Ungroup fields (remove from any group)
   */
  async ungroupFields(documentId: string, fieldIds: string[]): Promise<void> {
    await apiClient.post(`/documents/${documentId}/fields/ungroup`, { fieldIds });
  },

  /**
   * Reorder fields within a group
   */
  async reorderFieldsInGroup(
    documentId: string,
    groupId: string,
    fieldIds: string[]
  ): Promise<void> {
    await apiClient.post(`/documents/${documentId}/groups/${groupId}/fields/reorder`, {
      fieldIds,
    });
  },
};

export default fieldGroupService;
