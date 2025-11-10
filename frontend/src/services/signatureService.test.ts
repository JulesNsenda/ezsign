import { describe, it, expect, vi, beforeEach } from 'vitest';
import signatureService, { type SignatureData } from './signatureService';
import apiClient from '@/api/client';

// Mock the API client
vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('signatureService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSession', () => {
    it('should call correct endpoint with token', async () => {
      const mockToken = 'test-token-123';
      const mockSessionData = {
        document: {
          id: 'doc-1',
          title: 'Test Document',
          page_count: 3,
        },
        signer: {
          id: 'signer-1',
          email: 'test@example.com',
          name: 'Test User',
          status: 'pending',
        },
        fields: [],
        signatures: [],
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockSessionData });

      const result = await signatureService.getSession(mockToken);

      expect(apiClient.get).toHaveBeenCalledWith(`/signing/${mockToken}`);
      expect(result).toEqual(mockSessionData);
    });
  });

  describe('submitSignatures', () => {
    it('should call correct endpoint with token and signatures payload', async () => {
      const mockToken = 'test-token-456';
      const mockSignatures: SignatureData[] = [
        {
          field_id: 'field-1',
          signature_type: 'drawn',
          signature_data: 'data:image/png;base64,abc123',
        },
        {
          field_id: 'field-2',
          signature_type: 'typed',
          signature_data: 'data:image/png;base64,def456',
          text_value: 'John Doe',
          font_family: 'Arial',
        },
      ];

      const mockResponse = {
        success: true,
        message: 'Signature submitted successfully',
        data: {
          document_completed: true,
        },
      };

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockResponse });

      const result = await signatureService.submitSignatures(mockToken, mockSignatures);

      expect(apiClient.post).toHaveBeenCalledWith(`/signing/${mockToken}/sign`, {
        signatures: mockSignatures,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle empty signatures array', async () => {
      const mockToken = 'test-token-789';
      const mockSignatures: SignatureData[] = [];

      const mockResponse = {
        success: true,
        message: 'Signature submitted successfully',
        data: {
          document_completed: false,
        },
      };

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockResponse });

      const result = await signatureService.submitSignatures(mockToken, mockSignatures);

      expect(apiClient.post).toHaveBeenCalledWith(`/signing/${mockToken}/sign`, {
        signatures: [],
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getDownloadUrl', () => {
    it('should return correct download URL with default base URL', () => {
      const mockToken = 'download-token-123';
      const expectedUrl = 'http://localhost:3001/api/signing/download-token-123/download';

      const result = signatureService.getDownloadUrl(mockToken);

      expect(result).toBe(expectedUrl);
    });

    it('should use VITE_API_URL when set', () => {
      const originalEnv = import.meta.env.VITE_API_URL;
      import.meta.env.VITE_API_URL = 'https://api.example.com';

      const mockToken = 'download-token-456';
      const expectedUrl = 'https://api.example.com/api/signing/download-token-456/download';

      const result = signatureService.getDownloadUrl(mockToken);

      expect(result).toBe(expectedUrl);

      // Restore original env
      import.meta.env.VITE_API_URL = originalEnv;
    });
  });
});
