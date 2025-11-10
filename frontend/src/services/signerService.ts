import apiClient from '@/api/client';
import type { Signer } from '@/types';

/**
 * Signer service
 * Handles all signer-related API calls
 */

export interface CreateSignerData {
  email: string;
  name: string;
  signing_order?: number;
  role?: string;
}

export interface UpdateSignerData {
  name?: string;
  signing_order?: number;
  role?: string;
}

export const signerService = {
  /**
   * Create a new signer
   */
  async create(documentId: string, data: CreateSignerData): Promise<Signer> {
    const response = await apiClient.post<{ signer: Signer }>(
      `/documents/${documentId}/signers`,
      data
    );
    return response.data.signer;
  },

  /**
   * List all signers for a document
   */
  async list(documentId: string): Promise<Signer[]> {
    const response = await apiClient.get<{ success: boolean; data: Signer[] }>(
      `/documents/${documentId}/signers`
    );
    return response.data.data || [];
  },

  /**
   * Get a single signer by ID
   */
  async getById(documentId: string, signerId: string): Promise<Signer> {
    const response = await apiClient.get<{ signer: Signer }>(
      `/documents/${documentId}/signers/${signerId}`
    );
    return response.data.signer;
  },

  /**
   * Update a signer
   */
  async update(
    documentId: string,
    signerId: string,
    data: UpdateSignerData
  ): Promise<Signer> {
    const response = await apiClient.put<{ signer: Signer }>(
      `/documents/${documentId}/signers/${signerId}`,
      data
    );
    return response.data.signer;
  },

  /**
   * Delete a signer
   */
  async delete(documentId: string, signerId: string): Promise<void> {
    await apiClient.delete(`/documents/${documentId}/signers/${signerId}`);
  },

  /**
   * Send document to signers
   */
  async send(documentId: string, message?: string): Promise<void> {
    await apiClient.post(`/documents/${documentId}/send`, { message });
  },

  /**
   * Resend email to a specific signer
   */
  async resend(documentId: string, signerId: string): Promise<void> {
    await apiClient.post(`/documents/${documentId}/signers/${signerId}/resend`);
  },
};

export default signerService;
