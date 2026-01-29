import apiClient from '@/api/client';
import type { Field, Signer, Signature } from '@/types';

/**
 * Signature service
 * Handles signing operations for signers
 */

export interface SigningSessionData {
  document: {
    id: string;
    title: string;
    page_count: number;
    team_id?: string | null;
  };
  signer: Signer;
  fields: Field[];
  signatures: Signature[];
}

export interface SignatureData {
  field_id: string;
  signature_type: 'drawn' | 'typed' | 'uploaded';
  signature_data: string;
  text_value?: string;
  checkbox_value?: boolean;
  font_family?: string;
}

export interface SubmitSignaturesRequest {
  signatures: SignatureData[];
}

export interface SubmitSignaturesResponse {
  success: boolean;
  message: string;
  data: {
    document_completed: boolean;
  };
}

export const signatureService = {
  /**
   * Get signing session by access token
   */
  async getSession(token: string): Promise<SigningSessionData> {
    const response = await apiClient.get<SigningSessionData>(`/signing/${token}`);
    return response.data;
  },

  /**
   * Submit all signatures at once (matches backend API)
   */
  async submitSignatures(
    token: string,
    signatures: SignatureData[]
  ): Promise<SubmitSignaturesResponse> {
    const response = await apiClient.post<SubmitSignaturesResponse>(
      `/signing/${token}/sign`,
      { signatures }
    );
    return response.data;
  },

  /**
   * Get signed document download URL
   */
  getDownloadUrl(token: string): string {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    return `${baseUrl}/api/signing/${token}/download`;
  },
};

export default signatureService;
