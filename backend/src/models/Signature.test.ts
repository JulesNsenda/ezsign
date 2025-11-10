import { Signature, SignatureData } from './Signature';

describe('Signature Model', () => {
  const mockDrawnSignature: SignatureData = {
    id: 'sig-123',
    signer_id: 'signer-123',
    field_id: 'field-123',
    signature_type: 'drawn',
    signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    text_value: null,
    font_family: null,
    ip_address: '192.168.1.1',
    user_agent: 'Mozilla/5.0',
    signed_at: new Date('2025-01-01T10:00:00Z'),
    created_at: new Date('2025-01-01T10:00:00Z'),
  };

  const mockTypedSignature: SignatureData = {
    id: 'sig-456',
    signer_id: 'signer-456',
    field_id: 'field-456',
    signature_type: 'typed',
    signature_data: 'rendered-signature-image-base64',
    text_value: 'John Doe',
    font_family: 'Brush Script MT',
    ip_address: '192.168.1.2',
    user_agent: 'Mozilla/5.0',
    signed_at: new Date('2025-01-01T11:00:00Z'),
    created_at: new Date('2025-01-01T11:00:00Z'),
  };

  describe('Constructor', () => {
    it('should create a Signature instance with valid data', () => {
      const signature = new Signature(mockDrawnSignature);
      expect(signature.id).toBe(mockDrawnSignature.id);
      expect(signature.signature_type).toBe(mockDrawnSignature.signature_type);
      expect(signature.signer_id).toBe(mockDrawnSignature.signer_id);
    });
  });

  describe('Type Checks', () => {
    it('should correctly identify drawn signature', () => {
      const signature = new Signature(mockDrawnSignature);
      expect(signature.isDrawn()).toBe(true);
      expect(signature.isTyped()).toBe(false);
      expect(signature.isUploaded()).toBe(false);
    });

    it('should correctly identify typed signature', () => {
      const signature = new Signature(mockTypedSignature);
      expect(signature.isDrawn()).toBe(false);
      expect(signature.isTyped()).toBe(true);
      expect(signature.isUploaded()).toBe(false);
    });

    it('should correctly identify uploaded signature', () => {
      const uploaded = { ...mockDrawnSignature, signature_type: 'uploaded' as const };
      const signature = new Signature(uploaded);
      expect(signature.isDrawn()).toBe(false);
      expect(signature.isTyped()).toBe(false);
      expect(signature.isUploaded()).toBe(true);
    });
  });

  describe('isValidSignatureType', () => {
    it('should return true for valid signature types', () => {
      expect(Signature.isValidSignatureType('drawn')).toBe(true);
      expect(Signature.isValidSignatureType('typed')).toBe(true);
      expect(Signature.isValidSignatureType('uploaded')).toBe(true);
    });

    it('should return false for invalid signature types', () => {
      expect(Signature.isValidSignatureType('invalid')).toBe(false);
      expect(Signature.isValidSignatureType('scanned')).toBe(false);
      expect(Signature.isValidSignatureType('')).toBe(false);
    });
  });

  describe('isValidBase64Image', () => {
    it('should validate data URL base64 images', () => {
      expect(Signature.isValidBase64Image('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
      expect(Signature.isValidBase64Image('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(true);
      expect(Signature.isValidBase64Image('data:image/jpg;base64,abc123==')).toBe(true);
      expect(Signature.isValidBase64Image('data:image/gif;base64,R0lGOD==')).toBe(true);
      expect(Signature.isValidBase64Image('data:image/webp;base64,UklGRg==')).toBe(true);
    });

    it('should validate pure base64 strings', () => {
      expect(Signature.isValidBase64Image('iVBORw0KGgo=')).toBe(true);
      expect(Signature.isValidBase64Image('ABC123==')).toBe(true);
      expect(Signature.isValidBase64Image('abcdef123456')).toBe(true);
    });

    it('should reject invalid base64 strings', () => {
      expect(Signature.isValidBase64Image('')).toBe(false);
      expect(Signature.isValidBase64Image('not-base64!@#')).toBe(false);
      expect(Signature.isValidBase64Image('data:text/plain;base64,test')).toBe(false);
    });
  });

  describe('isValidTypedText', () => {
    it('should accept valid typed text', () => {
      expect(Signature.isValidTypedText('John Doe')).toBe(true);
      expect(Signature.isValidTypedText('A')).toBe(true);
      expect(Signature.isValidTypedText('a'.repeat(500))).toBe(true);
    });

    it('should reject invalid typed text', () => {
      expect(Signature.isValidTypedText('')).toBe(false);
      expect(Signature.isValidTypedText('   ')).toBe(false);
      expect(Signature.isValidTypedText('a'.repeat(501))).toBe(false);
    });
  });

  describe('validateSignatureData', () => {
    it('should validate drawn signature with valid base64', () => {
      const signature = new Signature(mockDrawnSignature);
      const result = signature.validateSignatureData();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should invalidate drawn signature with invalid data', () => {
      const invalid = { ...mockDrawnSignature, signature_data: 'not-base64!@#' };
      const signature = new Signature(invalid);
      const result = signature.validateSignatureData();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Signature data must be a valid base64 encoded image');
    });

    it('should validate typed signature with valid text', () => {
      const signature = new Signature(mockTypedSignature);
      const result = signature.validateSignatureData();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should invalidate typed signature without text value', () => {
      const invalid = { ...mockTypedSignature, text_value: null };
      const signature = new Signature(invalid);
      const result = signature.validateSignatureData();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Typed signature must have valid text (1-500 characters)');
    });

    it('should invalidate typed signature with empty text', () => {
      const invalid = { ...mockTypedSignature, text_value: '   ' };
      const signature = new Signature(invalid);
      const result = signature.validateSignatureData();
      expect(result.valid).toBe(false);
    });

    it('should invalidate typed signature with too long font family', () => {
      const invalid = { ...mockTypedSignature, font_family: 'a'.repeat(101) };
      const signature = new Signature(invalid);
      const result = signature.validateSignatureData();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Font family name too long (max 100 characters)');
    });

    it('should validate uploaded signature with valid base64', () => {
      const uploaded = { ...mockDrawnSignature, signature_type: 'uploaded' as const };
      const signature = new Signature(uploaded);
      const result = signature.validateSignatureData();
      expect(result.valid).toBe(true);
    });
  });

  describe('getDescription', () => {
    it('should return correct description for drawn signature', () => {
      const signature = new Signature(mockDrawnSignature);
      expect(signature.getDescription()).toBe('Hand-drawn signature');
    });

    it('should return correct description for typed signature', () => {
      const signature = new Signature(mockTypedSignature);
      expect(signature.getDescription()).toBe('Typed signature: John Doe');
    });

    it('should return correct description for uploaded signature', () => {
      const uploaded = { ...mockDrawnSignature, signature_type: 'uploaded' as const };
      const signature = new Signature(uploaded);
      expect(signature.getDescription()).toBe('Uploaded signature image');
    });
  });

  describe('getMetadata', () => {
    it('should return signature metadata', () => {
      const signature = new Signature(mockDrawnSignature);
      const metadata = signature.getMetadata();
      expect(metadata.ip_address).toBe('192.168.1.1');
      expect(metadata.user_agent).toBe('Mozilla/5.0');
      expect(metadata.signed_at).toEqual(mockDrawnSignature.signed_at);
    });
  });

  describe('toJSON', () => {
    it('should convert signature to JSON', () => {
      const signature = new Signature(mockDrawnSignature);
      const json = signature.toJSON();
      expect(json).toEqual(mockDrawnSignature);
    });
  });

  describe('toPublicJSON', () => {
    it('should exclude sensitive data from public JSON', () => {
      const signature = new Signature(mockDrawnSignature);
      const publicJson = signature.toPublicJSON();
      expect(publicJson).not.toHaveProperty('ip_address');
      expect(publicJson).not.toHaveProperty('user_agent');
      expect(publicJson).toHaveProperty('signature_data');
      expect(publicJson).toHaveProperty('signed_at');
    });
  });
});
