import { Signer, SignerStatus } from './Signer';

describe('Signer Model', () => {
  const mockSignerData = {
    id: 'signer-123',
    document_id: 'doc-123',
    email: 'test@example.com',
    name: 'Test User',
    signing_order: 0,
    status: 'pending' as SignerStatus,
    access_token: 'abc123token',
    signed_at: null,
    ip_address: null,
    user_agent: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  describe('Constructor', () => {
    it('should create a Signer instance with valid data', () => {
      const signer = new Signer(mockSignerData);
      expect(signer.id).toBe(mockSignerData.id);
      expect(signer.email).toBe(mockSignerData.email);
      expect(signer.name).toBe(mockSignerData.name);
      expect(signer.signing_order).toBe(mockSignerData.signing_order);
      expect(signer.status).toBe(mockSignerData.status);
    });
  });

  describe('generateAccessToken', () => {
    it('should generate a 64-character hex token', () => {
      const token = Signer.generateAccessToken();
      expect(token).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
    });

    it('should generate unique tokens', () => {
      const token1 = Signer.generateAccessToken();
      const token2 = Signer.generateAccessToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('Status Checks', () => {
    it('should correctly identify pending status', () => {
      const signer = new Signer(mockSignerData);
      expect(signer.isPending()).toBe(true);
      expect(signer.hasSigned()).toBe(false);
      expect(signer.hasDeclined()).toBe(false);
      expect(signer.canSign()).toBe(true);
    });

    it('should correctly identify signed status', () => {
      const signer = new Signer({
        ...mockSignerData,
        status: 'signed',
        signed_at: new Date(),
      });
      expect(signer.hasSigned()).toBe(true);
      expect(signer.isPending()).toBe(false);
      expect(signer.hasDeclined()).toBe(false);
      expect(signer.canSign()).toBe(false);
    });

    it('should correctly identify declined status', () => {
      const signer = new Signer({ ...mockSignerData, status: 'declined' });
      expect(signer.hasDeclined()).toBe(true);
      expect(signer.isPending()).toBe(false);
      expect(signer.hasSigned()).toBe(false);
      expect(signer.canSign()).toBe(false);
    });
  });

  describe('markAsSigned', () => {
    it('should mark signer as signed with metadata', () => {
      const signer = new Signer(mockSignerData);
      const ipAddress = '192.168.1.1';
      const userAgent = 'Mozilla/5.0';

      signer.markAsSigned(ipAddress, userAgent);

      expect(signer.status).toBe('signed');
      expect(signer.signed_at).toBeInstanceOf(Date);
      expect(signer.ip_address).toBe(ipAddress);
      expect(signer.user_agent).toBe(userAgent);
    });

    it('should throw error when signer cannot sign', () => {
      const signer = new Signer({ ...mockSignerData, status: 'signed' });
      expect(() => signer.markAsSigned()).toThrow('Signer cannot sign in current state');
    });
  });

  describe('markAsDeclined', () => {
    it('should mark signer as declined', () => {
      const signer = new Signer(mockSignerData);
      signer.markAsDeclined();
      expect(signer.status).toBe('declined');
    });

    it('should throw error when signer cannot decline', () => {
      const signer = new Signer({ ...mockSignerData, status: 'signed' });
      expect(() => signer.markAsDeclined()).toThrow('Signer cannot decline in current state');
    });
  });

  describe('resetToPending', () => {
    it('should reset signer to pending status', () => {
      const signer = new Signer({
        ...mockSignerData,
        status: 'signed',
        signed_at: new Date(),
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
      });

      signer.resetToPending();

      expect(signer.status).toBe('pending');
      expect(signer.signed_at).toBeNull();
      expect(signer.ip_address).toBeNull();
      expect(signer.user_agent).toBeNull();
    });
  });

  describe('Email Validation', () => {
    describe('isValidEmail', () => {
      it('should accept valid email addresses', () => {
        expect(Signer.isValidEmail('test@example.com')).toBe(true);
        expect(Signer.isValidEmail('user.name@domain.co.uk')).toBe(true);
        expect(Signer.isValidEmail('user+tag@example.com')).toBe(true);
      });

      it('should reject invalid email addresses', () => {
        expect(Signer.isValidEmail('invalid')).toBe(false);
        expect(Signer.isValidEmail('invalid@')).toBe(false);
        expect(Signer.isValidEmail('@example.com')).toBe(false);
        expect(Signer.isValidEmail('invalid@domain')).toBe(false);
        expect(Signer.isValidEmail('')).toBe(false);
      });
    });

    describe('validateEmail', () => {
      it('should validate signer email', () => {
        const signer = new Signer(mockSignerData);
        expect(signer.validateEmail()).toBe(true);
      });

      it('should reject invalid signer email', () => {
        const signer = new Signer({ ...mockSignerData, email: 'invalid-email' });
        expect(signer.validateEmail()).toBe(false);
      });
    });
  });

  describe('Signing Order Validation', () => {
    describe('isValidSigningOrder', () => {
      it('should accept null signing order', () => {
        expect(Signer.isValidSigningOrder(null)).toBe(true);
      });

      it('should accept non-negative integers', () => {
        expect(Signer.isValidSigningOrder(0)).toBe(true);
        expect(Signer.isValidSigningOrder(1)).toBe(true);
        expect(Signer.isValidSigningOrder(10)).toBe(true);
      });

      it('should reject negative numbers', () => {
        expect(Signer.isValidSigningOrder(-1)).toBe(false);
      });
    });

    describe('validateSigningOrder', () => {
      it('should validate valid signing order', () => {
        const signer = new Signer(mockSignerData);
        expect(signer.validateSigningOrder()).toBe(true);
      });

      it('should validate null signing order', () => {
        const signer = new Signer({ ...mockSignerData, signing_order: null });
        expect(signer.validateSigningOrder()).toBe(true);
      });
    });

    describe('hasSigningOrder', () => {
      it('should return true when signing order is set', () => {
        const signer = new Signer(mockSignerData);
        expect(signer.hasSigningOrder()).toBe(true);
      });

      it('should return false when signing order is null', () => {
        const signer = new Signer({ ...mockSignerData, signing_order: null });
        expect(signer.hasSigningOrder()).toBe(false);
      });
    });
  });

  describe('canSignInSequence', () => {
    it('should allow signing in parallel workflow (no signing order)', () => {
      const signer = new Signer({ ...mockSignerData, signing_order: null });
      const result = Signer.canSignInSequence(signer, [signer]);
      expect(result).toBe(true);
    });

    it('should allow first signer in sequential workflow', () => {
      const signer = new Signer({ ...mockSignerData, signing_order: 0 });
      const result = Signer.canSignInSequence(signer, [signer]);
      expect(result).toBe(true);
    });

    it('should allow second signer when first has signed', () => {
      const signer1 = new Signer({
        ...mockSignerData,
        id: 'signer-1',
        signing_order: 0,
        status: 'signed',
      });
      const signer2 = new Signer({
        ...mockSignerData,
        id: 'signer-2',
        signing_order: 1,
        status: 'pending',
      });

      const result = Signer.canSignInSequence(signer2, [signer1, signer2]);
      expect(result).toBe(true);
    });

    it('should not allow second signer when first has not signed', () => {
      const signer1 = new Signer({
        ...mockSignerData,
        id: 'signer-1',
        signing_order: 0,
        status: 'pending',
      });
      const signer2 = new Signer({
        ...mockSignerData,
        id: 'signer-2',
        signing_order: 1,
        status: 'pending',
      });

      const result = Signer.canSignInSequence(signer2, [signer1, signer2]);
      expect(result).toBe(false);
    });

    it('should allow third signer when first two have signed', () => {
      const signer1 = new Signer({
        ...mockSignerData,
        id: 'signer-1',
        signing_order: 0,
        status: 'signed',
      });
      const signer2 = new Signer({
        ...mockSignerData,
        id: 'signer-2',
        signing_order: 1,
        status: 'signed',
      });
      const signer3 = new Signer({
        ...mockSignerData,
        id: 'signer-3',
        signing_order: 2,
        status: 'pending',
      });

      const result = Signer.canSignInSequence(signer3, [signer1, signer2, signer3]);
      expect(result).toBe(true);
    });
  });

  describe('getSigningUrl', () => {
    it('should generate correct signing URL', () => {
      const signer = new Signer(mockSignerData);
      const baseUrl = 'https://example.com';
      const url = signer.getSigningUrl(baseUrl);

      expect(url).toBe(`${baseUrl}/sign/${mockSignerData.access_token}`);
    });
  });

  describe('isValidStatus', () => {
    it('should return true for valid statuses', () => {
      expect(Signer.isValidStatus('pending')).toBe(true);
      expect(Signer.isValidStatus('signed')).toBe(true);
      expect(Signer.isValidStatus('declined')).toBe(true);
    });

    it('should return false for invalid statuses', () => {
      expect(Signer.isValidStatus('invalid')).toBe(false);
      expect(Signer.isValidStatus('')).toBe(false);
    });
  });

  describe('getStatusDisplay', () => {
    it('should return correct display text for each status', () => {
      const pendingSigner = new Signer(mockSignerData);
      expect(pendingSigner.getStatusDisplay()).toBe('Pending');

      const signedSigner = new Signer({ ...mockSignerData, status: 'signed' });
      expect(signedSigner.getStatusDisplay()).toBe('Signed');

      const declinedSigner = new Signer({ ...mockSignerData, status: 'declined' });
      expect(declinedSigner.getStatusDisplay()).toBe('Declined');
    });
  });

  describe('getFormattedSignedDate', () => {
    it('should return null when not signed', () => {
      const signer = new Signer(mockSignerData);
      expect(signer.getFormattedSignedDate()).toBeNull();
    });

    it('should return ISO string when signed', () => {
      const signedAt = new Date('2024-01-15T10:30:00Z');
      const signer = new Signer({ ...mockSignerData, signed_at: signedAt });
      expect(signer.getFormattedSignedDate()).toBe(signedAt.toISOString());
    });
  });

  describe('toJSON', () => {
    it('should convert signer to JSON', () => {
      const signer = new Signer(mockSignerData);
      const json = signer.toJSON();

      expect(json).toEqual(mockSignerData);
    });
  });

  describe('toPublicJSON', () => {
    it('should exclude access token from public JSON', () => {
      const signer = new Signer(mockSignerData);
      const publicJson = signer.toPublicJSON();

      expect(publicJson).not.toHaveProperty('access_token');
      expect(publicJson.email).toBe(mockSignerData.email);
      expect(publicJson.name).toBe(mockSignerData.name);
      expect(publicJson.status).toBe(mockSignerData.status);
    });
  });
});
