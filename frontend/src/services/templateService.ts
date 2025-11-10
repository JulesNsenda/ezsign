import apiClient from '@/api/client';
import type { Template, PaginatedResponse, Document } from '@/types';

/**
 * Template service
 * Handles all template-related API calls
 */

export interface CreateTemplateData {
  name: string;
  description?: string;
  document_id: string;
}

export interface UpdateTemplateData {
  name?: string;
  description?: string;
}

export interface ListTemplatesParams {
  page?: number;
  limit?: number;
  team_id?: string;
  sort_by?: 'created_at' | 'updated_at' | 'name';
  sort_order?: 'asc' | 'desc';
}

export const templateService = {
  /**
   * Create a template from an existing document
   */
  async create(data: CreateTemplateData): Promise<Template> {
    const response = await apiClient.post<{
      success: boolean;
      data: { template: Template };
    }>('/templates', data);
    return response.data.data.template;
  },

  /**
   * List templates with pagination
   */
  async list(params?: ListTemplatesParams): Promise<PaginatedResponse<Template>> {
    const response = await apiClient.get<{
      success: boolean;
      data: {
        templates: Template[];
        total: number;
        limit: number;
        offset: number;
      };
    }>('/templates', {
      params,
    });

    const { templates, total, limit, offset } = response.data.data;
    const page = Math.floor(offset / limit) + 1;

    return {
      items: templates,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get a single template by ID
   */
  async getById(id: string): Promise<Template> {
    const response = await apiClient.get<{
      success: boolean;
      data: { template: Template };
    }>(`/templates/${id}`);
    return response.data.data.template;
  },

  /**
   * Update a template
   */
  async update(id: string, data: UpdateTemplateData): Promise<Template> {
    const response = await apiClient.put<{
      success: boolean;
      data: Template;
    }>(`/templates/${id}`, data);
    return response.data.data;
  },

  /**
   * Delete a template
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/templates/${id}`);
  },

  /**
   * Create a document from a template
   */
  async createDocument(templateId: string, title: string): Promise<Document> {
    const response = await apiClient.post<{
      success: boolean;
      data: { document_id: string };
    }>(`/templates/${templateId}/documents`, { title });
    // Note: Backend returns only document_id, not full document
    return { id: response.data.data.document_id } as Document;
  },

  /**
   * Get template thumbnail URL
   */
  getThumbnailUrl(id: string, width = 200, height = 300): string {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const token = localStorage.getItem('access_token');
    return `${baseUrl}/api/templates/${id}/thumbnail?width=${width}&height=${height}&token=${token}`;
  },
};

export default templateService;
