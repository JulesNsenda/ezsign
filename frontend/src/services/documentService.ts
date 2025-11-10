import apiClient from '@/api/client';
import type { Document, PaginatedResponse } from '@/types';

/**
 * Document service
 * Handles all document-related API calls
 */

export interface CreateDocumentData {
  title: string;
  team_id?: string;
  workflow_type?: 'single' | 'sequential' | 'parallel';
}

export interface ListDocumentsParams {
  page?: number;
  limit?: number;
  team_id?: string;
  status?: 'draft' | 'pending' | 'completed' | 'cancelled';
  sort_by?: 'created_at' | 'updated_at' | 'title';
  sort_order?: 'asc' | 'desc';
}

export interface UpdateDocumentData {
  title?: string;
  status?: 'draft' | 'pending' | 'completed' | 'cancelled';
}

export const documentService = {
  /**
   * Upload a new document
   */
  async upload(file: File, data: CreateDocumentData): Promise<Document> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', data.title);
    if (data.team_id) formData.append('team_id', data.team_id);
    if (data.workflow_type) formData.append('workflow_type', data.workflow_type);

    const response = await apiClient.post<{ document: Document }>('/documents', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data.document;
  },

  /**
   * List documents with pagination
   */
  async list(params?: ListDocumentsParams): Promise<PaginatedResponse<Document>> {
    const response = await apiClient.get<PaginatedResponse<Document>>('/documents', {
      params,
    });

    return response.data;
  },

  /**
   * Get a single document by ID
   */
  async getById(id: string): Promise<Document> {
    const response = await apiClient.get<{ document: Document }>(`/documents/${id}`);
    return response.data.document;
  },

  /**
   * Update a document
   */
  async update(id: string, data: UpdateDocumentData): Promise<Document> {
    const response = await apiClient.put<{ document: Document }>(`/documents/${id}`, data);
    return response.data.document;
  },

  /**
   * Delete a document
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/documents/${id}`);
  },

  /**
   * Download a document
   */
  async download(id: string): Promise<Blob> {
    const response = await apiClient.get(`/documents/${id}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Get document thumbnail
   */
  getThumbnailUrl(id: string, width = 200, height = 300): string {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const token = localStorage.getItem('access_token');
    return `${baseUrl}/api/documents/${id}/thumbnail?width=${width}&height=${height}&token=${token}`;
  },

  /**
   * Get document metadata
   */
  async getMetadata(id: string): Promise<any> {
    const response = await apiClient.get(`/documents/${id}/metadata`);
    return response.data;
  },
};

export default documentService;
