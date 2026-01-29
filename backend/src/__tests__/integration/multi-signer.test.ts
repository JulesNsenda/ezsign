import { Signer, SignerData } from '@/models/Signer';

/**
 * Integration tests for multi-signer workflows
 * Tests parallel and sequential signing with multiple signers
 */
describe('Multi-Signer Workflow Tests', () => {
  const testDocumentId = 'doc-456';

  const createMockSignerData = (
    index: number,
    workflow: 'parallel' | 'sequential',
    status: 'pending' | 'signed' | 'declined' = 'pending'
  ): SignerData => {
    return {
      id: `signer-${index + 1}`,
      document_id: testDocumentId,
      email: `signer${index + 1}@example.com`,
      name: `Signer ${index + 1}`,
      status,
      access_token: `token-${index + 1}`,
      signing_order: workflow === 'sequential' ? index : null,
      signed_at: status === 'signed' ? new Date() : null,
      ip_address: null,
      user_agent: null,
      last_reminder_sent_at: null,
      reminder_count: 0,
      created_at: new Date(),
      updated_at: new Date(),
    };
  };

  const createMockSigners = (
    count: number,
    workflow: 'parallel' | 'sequential',
    signedCount: number = 0
  ): Signer[] => {
    return Array.from({ length: count }, (_, i) => {
      const status = i < signedCount ? 'signed' : 'pending';
      return new Signer(createMockSignerData(i, workflow, status as 'pending' | 'signed'));
    });
  };

  describe('Parallel Workflow', () => {
    it('should allow any signer to sign in parallel workflow', () => {
      const signers = createMockSigners(3, 'parallel');

      // In parallel workflow, all signers can sign
      signers.forEach(signer => {
        expect(signer.signing_order).toBeNull();
        expect(signer.canSign()).toBe(true);
      });
    });

    it('should track individual signer status in parallel', () => {
      const signers = createMockSigners(3, 'parallel');

      // First signer signs
      signers[0]!.markAsSigned('127.0.0.1', 'Test Agent');

      expect(signers[0]!.hasSigned()).toBe(true);
      expect(signers[1]!.isPending()).toBe(true);
      expect(signers[2]!.isPending()).toBe(true);
    });

    it('should not enforce order in parallel workflow', () => {
      const signers = createMockSigners(3, 'parallel');

      // Third signer can sign first in parallel
      const thirdSigner = signers[2]!;
      expect(thirdSigner.canSign()).toBe(true);

      // canSignInSequence should return true for parallel (null signing_order)
      expect(Signer.canSignInSequence(thirdSigner, signers)).toBe(true);
    });
  });

  describe('Sequential Workflow', () => {
    it('should only allow first signer initially', () => {
      const signers = createMockSigners(3, 'sequential');

      // First signer can sign
      expect(Signer.canSignInSequence(signers[0]!, signers)).toBe(true);

      // Second and third signers cannot sign yet
      expect(Signer.canSignInSequence(signers[1]!, signers)).toBe(false);
      expect(Signer.canSignInSequence(signers[2]!, signers)).toBe(false);
    });

    it('should allow next signer after previous has signed', () => {
      const signers = createMockSigners(3, 'sequential', 1); // First signed

      // Second signer can now sign
      expect(Signer.canSignInSequence(signers[1]!, signers)).toBe(true);

      // Third signer still cannot sign
      expect(Signer.canSignInSequence(signers[2]!, signers)).toBe(false);
    });

    it('should allow last signer after all previous have signed', () => {
      const signers = createMockSigners(3, 'sequential', 2); // First two signed

      // Third signer can now sign
      expect(Signer.canSignInSequence(signers[2]!, signers)).toBe(true);
    });

    it('should correctly track signing order', () => {
      const signers = createMockSigners(3, 'sequential');

      expect(signers[0]!.signing_order).toBe(0);
      expect(signers[1]!.signing_order).toBe(1);
      expect(signers[2]!.signing_order).toBe(2);

      signers.forEach(signer => {
        expect(signer.hasSigningOrder()).toBe(true);
      });
    });
  });

  describe('Signer Model Helpers', () => {
    it('should correctly determine signing order in sequence', () => {
      const signers = [
        new Signer(createMockSignerData(0, 'sequential', 'signed')),
        new Signer(createMockSignerData(1, 'sequential', 'pending')),
        new Signer(createMockSignerData(2, 'sequential', 'pending')),
      ];

      // Second signer can sign (first is done)
      expect(Signer.canSignInSequence(signers[1]!, signers)).toBe(true);

      // Third signer cannot sign yet (second still pending)
      expect(Signer.canSignInSequence(signers[2]!, signers)).toBe(false);
    });

    it('should track signer status correctly', () => {
      const signer = new Signer(createMockSignerData(0, 'sequential'));

      expect(signer.isPending()).toBe(true);
      expect(signer.hasSigned()).toBe(false);
      expect(signer.hasDeclined()).toBe(false);
    });

    it('should update status when marked as signed', () => {
      const signer = new Signer(createMockSignerData(0, 'sequential'));

      signer.markAsSigned('192.168.1.1', 'Mozilla/5.0');

      expect(signer.hasSigned()).toBe(true);
      expect(signer.isPending()).toBe(false);
      expect(signer.signed_at).toBeDefined();
      expect(signer.ip_address).toBe('192.168.1.1');
      expect(signer.user_agent).toBe('Mozilla/5.0');
    });

    it('should prevent double signing', () => {
      const signer = new Signer(createMockSignerData(0, 'sequential'));
      signer.markAsSigned();

      expect(() => signer.markAsSigned()).toThrow();
    });

    it('should handle declined status', () => {
      const signer = new Signer(createMockSignerData(0, 'sequential'));
      signer.markAsDeclined();

      expect(signer.hasDeclined()).toBe(true);
      expect(signer.canSign()).toBe(false);
    });
  });

  describe('Document Completion', () => {
    it('should detect when all signers have completed', () => {
      const signers = createMockSigners(2, 'parallel', 2); // All signed

      const allSigned = signers.every(s => s.hasSigned());
      expect(allSigned).toBe(true);
    });

    it('should detect incomplete signing', () => {
      const signers = createMockSigners(2, 'parallel', 1); // Only first signed

      const allSigned = signers.every(s => s.hasSigned());
      expect(allSigned).toBe(false);

      const pendingSigners = signers.filter(s => s.isPending());
      expect(pendingSigners.length).toBe(1);
    });

    it('should handle mix of signed and declined', () => {
      const signers = [
        new Signer(createMockSignerData(0, 'parallel', 'signed')),
        new Signer(createMockSignerData(1, 'parallel', 'declined')),
      ];

      expect(signers[0]!.hasSigned()).toBe(true);
      expect(signers[1]!.hasDeclined()).toBe(true);

      const allCompleted = signers.every(s => s.hasSigned() || s.hasDeclined());
      expect(allCompleted).toBe(true);
    });
  });

  describe('Signer Validation', () => {
    it('should validate email format', () => {
      expect(Signer.isValidEmail('valid@example.com')).toBe(true);
      expect(Signer.isValidEmail('invalid-email')).toBe(false);
      expect(Signer.isValidEmail('')).toBe(false);
    });

    it('should validate signing order', () => {
      expect(Signer.isValidSigningOrder(0)).toBe(true);
      expect(Signer.isValidSigningOrder(1)).toBe(true);
      expect(Signer.isValidSigningOrder(null)).toBe(true); // Valid for parallel
      expect(Signer.isValidSigningOrder(-1)).toBe(false);
    });

    it('should validate signer status', () => {
      expect(Signer.isValidStatus('pending')).toBe(true);
      expect(Signer.isValidStatus('signed')).toBe(true);
      expect(Signer.isValidStatus('declined')).toBe(true);
      expect(Signer.isValidStatus('invalid')).toBe(false);
    });
  });

  describe('Signer Access Token', () => {
    it('should generate unique access tokens', () => {
      const token1 = Signer.generateAccessToken();
      const token2 = Signer.generateAccessToken();

      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
      expect(token1).not.toBe(token2);
      expect(token1.length).toBe(64); // 32 bytes hex = 64 chars
    });

    it('should generate signing URL', () => {
      const signer = new Signer(createMockSignerData(0, 'parallel'));
      const url = signer.getSigningUrl('https://app.example.com');

      expect(url).toBe(`https://app.example.com/sign/${signer.access_token}`);
    });
  });

  describe('Reminder Functionality', () => {
    it('should allow resending reminder under limit', () => {
      const signer = new Signer(createMockSignerData(0, 'parallel'));
      signer.reminder_count = 2;

      const { canResend, reason } = signer.canResendReminder();
      expect(canResend).toBe(true);
      expect(reason).toBeUndefined();
    });

    it('should block resending after limit reached', () => {
      const signer = new Signer(createMockSignerData(0, 'parallel'));
      signer.reminder_count = 5;
      signer.last_reminder_sent_at = new Date(); // Just sent

      const { canResend, reason } = signer.canResendReminder();
      expect(canResend).toBe(false);
      expect(reason).toBeDefined();
    });

    it('should reset counter after 24 hours', () => {
      const signer = new Signer(createMockSignerData(0, 'parallel'));
      signer.reminder_count = 5;
      signer.last_reminder_sent_at = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago

      const { canResend } = signer.canResendReminder();
      expect(canResend).toBe(true);
    });
  });
});
