import { EmailService, EmailConfig } from './emailService';
import logger from '@/services/loggerService';

// Mock nodemailer
jest.mock('nodemailer');
import nodemailer from 'nodemailer';

describe('EmailService', () => {
  let emailService: EmailService;
  let mockSendMail: jest.Mock;
  let mockVerify: jest.Mock;

  const mockConfig: EmailConfig = {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    auth: {
      user: 'test@example.com',
      pass: 'password',
    },
    from: 'noreply@ezsign.com',
  };

  const baseUrl = 'https://ezsign.com';

  beforeEach(() => {
    mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
    mockVerify = jest.fn().mockResolvedValue(true);

    (nodemailer.createTransport as jest.Mock) = jest.fn().mockReturnValue({
      sendMail: mockSendMail,
      verify: mockVerify,
    });

    emailService = new EmailService(mockConfig, baseUrl);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create transporter with correct config', () => {
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: mockConfig.host,
        port: mockConfig.port,
        secure: mockConfig.secure,
        auth: {
          user: mockConfig.auth!.user,
          pass: mockConfig.auth!.pass,
        },
      });
    });
  });

  describe('sendSigningRequest', () => {
    it('should send signing request email', async () => {
      const data = {
        recipientEmail: 'signer@example.com',
        recipientName: 'John Doe',
        documentTitle: 'Contract Agreement',
        senderName: 'Alice Smith',
        signingUrl: 'https://ezsign.com/sign/abc123',
      };

      await emailService.sendSigningRequest(data);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0];

      expect(callArgs.from).toBe(mockConfig.from);
      expect(callArgs.to).toBe(data.recipientEmail);
      expect(callArgs.subject).toContain(data.senderName);
      expect(callArgs.subject).toContain(data.documentTitle);
      expect(callArgs.html).toContain(data.recipientName);
      expect(callArgs.html).toContain(data.signingUrl);
      expect(callArgs.text).toContain(data.recipientName);
      expect(callArgs.text).toContain(data.signingUrl);
    });

    it('should include optional message in email', async () => {
      const data = {
        recipientEmail: 'signer@example.com',
        recipientName: 'John Doe',
        documentTitle: 'Contract Agreement',
        senderName: 'Alice Smith',
        signingUrl: 'https://ezsign.com/sign/abc123',
        message: 'Please review carefully',
      };

      await emailService.sendSigningRequest(data);

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).toContain(data.message);
      expect(callArgs.text).toContain(data.message);
    });
  });

  describe('sendCompletionNotification', () => {
    it('should send completion notification email', async () => {
      const data = {
        recipientEmail: 'user@example.com',
        recipientName: 'Alice Smith',
        documentTitle: 'Contract Agreement',
        completedAt: new Date('2025-01-01T10:00:00Z'),
      };

      await emailService.sendCompletionNotification(data);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0];

      expect(callArgs.from).toBe(mockConfig.from);
      expect(callArgs.to).toBe(data.recipientEmail);
      expect(callArgs.subject).toContain(data.documentTitle);
      expect(callArgs.html).toContain(data.recipientName);
      expect(callArgs.html).toContain('completed');
      expect(callArgs.text).toContain(data.recipientName);
    });

    it('should include download URL when provided', async () => {
      const data = {
        recipientEmail: 'user@example.com',
        recipientName: 'Alice Smith',
        documentTitle: 'Contract Agreement',
        completedAt: new Date('2025-01-01T10:00:00Z'),
        downloadUrl: 'https://ezsign.com/download/doc123',
      };

      await emailService.sendCompletionNotification(data);

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).toContain(data.downloadUrl);
      expect(callArgs.text).toContain(data.downloadUrl);
    });
  });

  describe('sendReminder', () => {
    it('should send reminder email', async () => {
      const data = {
        recipientEmail: 'signer@example.com',
        recipientName: 'John Doe',
        documentTitle: 'Contract Agreement',
        senderName: 'Alice Smith',
        signingUrl: 'https://ezsign.com/sign/abc123',
        daysWaiting: 3,
      };

      await emailService.sendReminder(data);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0];

      expect(callArgs.from).toBe(mockConfig.from);
      expect(callArgs.to).toBe(data.recipientEmail);
      expect(callArgs.subject).toContain('Reminder');
      expect(callArgs.subject).toContain(data.documentTitle);
      expect(callArgs.html).toContain(data.recipientName);
      expect(callArgs.html).toContain(data.signingUrl);
      expect(callArgs.html).toContain('3 days');
      expect(callArgs.text).toContain('3 days');
    });

    it('should use singular "day" for 1 day', async () => {
      const data = {
        recipientEmail: 'signer@example.com',
        recipientName: 'John Doe',
        documentTitle: 'Contract Agreement',
        senderName: 'Alice Smith',
        signingUrl: 'https://ezsign.com/sign/abc123',
        daysWaiting: 1,
      };

      await emailService.sendReminder(data);

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('1 day');
      expect(callArgs.text).toContain('1 day');
    });
  });

  describe('verifyConnection', () => {
    it('should return true when verification succeeds', async () => {
      mockVerify.mockResolvedValue(true);
      const result = await emailService.verifyConnection();
      expect(result).toBe(true);
      expect(mockVerify).toHaveBeenCalledTimes(1);
    });

    it('should return false when verification fails', async () => {
      mockVerify.mockRejectedValue(new Error('Connection failed'));
      const result = await emailService.verifyConnection();
      expect(result).toBe(false);
      expect(mockVerify).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateSigningUrl', () => {
    it('should generate correct signing URL', () => {
      const token = 'abc123def456';
      const url = emailService.generateSigningUrl(token);
      expect(url).toBe(`${baseUrl}/sign/${token}`);
    });
  });

  describe('generateDownloadUrl', () => {
    it('should generate correct download URL', () => {
      const documentId = 'doc-123';
      const url = emailService.generateDownloadUrl(documentId);
      expect(url).toBe(`${baseUrl}/api/documents/${documentId}/download`);
    });
  });

  describe('HTML injection protection', () => {
    const scriptPayload = '<script>alert(1)</script>';
    const attrBreakoutPayload = `x" onerror="alert(1)`;
    const maliciousUrl = 'javascript:alert(1)';

    // signingUrl/downloadUrl/resetPasswordUrl are "structural" URLs (Item F2)
    // - a javascript: value there now throws via requireStructuralUrl rather
    // than silently rendering href="" (see the dedicated
    // 'requireStructuralUrl' describe block below for that behavior). These
    // tests use a valid URL so they can isolate the text-field escaping
    // (recipientName/documentTitle/senderName/message/ipAddress) they're
    // actually about.
    it('should escape a script/quote payload in generateSigningRequestHtml', async () => {
      await emailService.sendSigningRequest({
        recipientEmail: 'signer@example.com',
        recipientName: `${scriptPayload}${attrBreakoutPayload}`,
        documentTitle: scriptPayload,
        senderName: attrBreakoutPayload,
        signingUrl: 'https://ezsign.com/sign/abc123',
        message: scriptPayload,
      });

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).not.toContain(scriptPayload);
      expect(html).not.toContain(attrBreakoutPayload);
      expect(html).toContain('&lt;script&gt;');
    });

    it('should escape a script/quote payload in generateCompletionHtml', async () => {
      await emailService.sendCompletionNotification({
        recipientEmail: 'user@example.com',
        recipientName: `${scriptPayload}${attrBreakoutPayload}`,
        documentTitle: scriptPayload,
        completedAt: new Date('2025-01-01T10:00:00Z'),
        downloadUrl: 'https://ezsign.com/download/doc123',
      });

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).not.toContain(scriptPayload);
      expect(html).not.toContain(attrBreakoutPayload);
      expect(html).toContain('&lt;script&gt;');
    });

    it('should escape a script/quote payload in generateReminderHtml', async () => {
      await emailService.sendReminder({
        recipientEmail: 'signer@example.com',
        recipientName: `${scriptPayload}${attrBreakoutPayload}`,
        documentTitle: scriptPayload,
        senderName: attrBreakoutPayload,
        signingUrl: 'https://ezsign.com/sign/abc123',
        daysWaiting: 2,
      });

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).not.toContain(scriptPayload);
      expect(html).not.toContain(attrBreakoutPayload);
      expect(html).toContain('&lt;script&gt;');
    });

    it('should escape a script/quote payload in generatePasswordChangeHtml', async () => {
      await emailService.sendPasswordChangeNotification({
        recipientEmail: 'user@example.com',
        recipientName: `${scriptPayload}${attrBreakoutPayload}`,
        changedAt: new Date('2025-01-01T10:00:00Z'),
        ipAddress: attrBreakoutPayload,
        resetPasswordUrl: 'https://ezsign.com/reset-password/abc123',
      });

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).not.toContain(scriptPayload);
      expect(html).not.toContain(attrBreakoutPayload);
      expect(html).toContain('&lt;script&gt;');
    });

    it('should escape a script/quote payload and drop a javascript: URL in generateEmailVerificationHtml', async () => {
      await emailService.sendEmailVerification({
        recipientEmail: 'user@example.com',
        recipientName: `${scriptPayload}${attrBreakoutPayload}`,
        verificationToken: 'abc123',
        baseUrl,
      });

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).not.toContain(scriptPayload);
      expect(html).not.toContain(attrBreakoutPayload);
      expect(html).toContain('&lt;script&gt;');
    });

    it('should escape branding-supplied values and drop malicious URLs in generateFooterLinks (via sendSigningRequest)', async () => {
      await emailService.sendSigningRequest({
        recipientEmail: 'signer@example.com',
        recipientName: 'John Doe',
        documentTitle: 'Contract',
        senderName: 'Alice',
        signingUrl: 'https://ezsign.com/sign/abc123',
        branding: {
          companyName: `${scriptPayload}${attrBreakoutPayload}`,
          footerText: `${scriptPayload}${attrBreakoutPayload}`,
          logoUrl: maliciousUrl,
          supportUrl: maliciousUrl,
          privacyUrl: maliciousUrl,
          termsUrl: maliciousUrl,
        },
      });

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).not.toContain(scriptPayload);
      expect(html).not.toContain(attrBreakoutPayload);
      expect(html).not.toContain(maliciousUrl);
      expect(html).toContain('&lt;script&gt;');
    });

    it('should keep a valid support URL and drop a mailto fallback per generateFooterLinks precedence', async () => {
      await emailService.sendSigningRequest({
        recipientEmail: 'signer@example.com',
        recipientName: 'John Doe',
        documentTitle: 'Contract',
        senderName: 'Alice',
        signingUrl: 'https://ezsign.com/sign/abc123',
        branding: {
          supportUrl: 'https://example.com/support',
        },
      });

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('https://example.com/support');
    });

    it('should throw for a schemeless signing URL (a structural URL) and record a failed email_logs row, rather than silently dropping it', async () => {
      // A misconfigured app.url (e.g. an env-sourced APP_URL without a
      // scheme, which bypasses the admin-write appUrlSchema check) produces
      // exactly this shape via buildSigningUrl's plain concatenation. This
      // used to render `href=""` and warn - a dead button reported as a
      // successful `sent` email. It now throws so the failure is visible as
      // a `failed` email_logs row with a real reason instead of a warn line
      // nobody reads.
      const mockCreateLog = jest.fn().mockResolvedValue({ id: 'log-1' });
      const mockMarkAsSent = jest.fn().mockResolvedValue(undefined);
      const mockMarkAsFailed = jest.fn().mockResolvedValue(undefined);
      const emailServiceWithLog = new EmailService(mockConfig, baseUrl, {
        createLog: mockCreateLog,
        markAsSent: mockMarkAsSent,
        markAsFailed: mockMarkAsFailed,
      } as any);

      await expect(
        emailServiceWithLog.sendSigningRequest({
          recipientEmail: 'signer@example.com',
          recipientName: 'John Doe',
          documentTitle: 'Contract',
          senderName: 'Alice',
          signingUrl: 'ezsign.dropkit.sh/sign/abc123',
        })
      ).rejects.toThrow(/signing URL failed validation/);

      expect(mockSendMail).not.toHaveBeenCalled();
      expect(mockCreateLog).toHaveBeenCalledTimes(1);
      expect(mockMarkAsFailed).toHaveBeenCalledWith(
        'log-1',
        expect.stringContaining('signing URL failed validation')
      );
      expect(mockMarkAsSent).not.toHaveBeenCalled();
    });

    it('should throw for a javascript: signing URL rather than dropping it', async () => {
      await expect(
        emailService.sendSigningRequest({
          recipientEmail: 'signer@example.com',
          recipientName: 'John Doe',
          documentTitle: 'Contract',
          senderName: 'Alice',
          signingUrl: maliciousUrl,
        })
      ).rejects.toThrow(/signing URL failed validation/);

      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should not throw for an omitted optional structural URL (downloadUrl/resetPasswordUrl), unlike a present-but-invalid one', async () => {
      await expect(
        emailService.sendCompletionNotification({
          recipientEmail: 'user@example.com',
          recipientName: 'Alice Smith',
          documentTitle: 'Contract Agreement',
          completedAt: new Date('2025-01-01T10:00:00Z'),
          // downloadUrl omitted entirely
        })
      ).resolves.toBeUndefined();

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).not.toContain('Download Document');
    });

    it('should not warn when the signing URL is valid', async () => {
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

      await emailService.sendSigningRequest({
        recipientEmail: 'signer@example.com',
        recipientName: 'John Doe',
        documentTitle: 'Contract',
        senderName: 'Alice',
        signingUrl: 'https://ezsign.com/sign/abc123',
      });

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should render a valid mailto support link when supportEmail is used', async () => {
      await emailService.sendSigningRequest({
        recipientEmail: 'signer@example.com',
        recipientName: 'John Doe',
        documentTitle: 'Contract',
        senderName: 'Alice',
        signingUrl: 'https://ezsign.com/sign/abc123',
        branding: {
          supportEmail: 'support@example.com',
        },
      });

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('mailto:support@example.com');
    });

    it('should escape a CSS/style-breakout payload in branding primaryColor rather than interpolating it raw', async () => {
      const breakout = '</style><script>alert(1)</script>';

      await emailService.sendSigningRequest({
        recipientEmail: 'signer@example.com',
        recipientName: 'John Doe',
        documentTitle: 'Contract',
        senderName: 'Alice',
        signingUrl: 'https://ezsign.com/sign/abc123',
        branding: {
          primaryColor: breakout,
        },
      });

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).not.toContain(breakout);
      expect(html).toContain('&lt;/style&gt;&lt;script&gt;');
    });

    it('should escape a CSS/style-breakout payload in branding secondaryColor rather than interpolating it raw', async () => {
      const breakout = '</style><script>alert(1)</script>';

      await emailService.sendCompletionNotification({
        recipientEmail: 'user@example.com',
        recipientName: 'Alice Smith',
        documentTitle: 'Contract Agreement',
        completedAt: new Date('2025-01-01T10:00:00Z'),
        branding: {
          secondaryColor: breakout,
        },
      });

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).not.toContain(breakout);
      expect(html).toContain('&lt;/style&gt;&lt;script&gt;');
    });
  });

  describe('sendWithLogging - Item 2.1 (log-first ordering)', () => {
    // What genuinely throws during config resolution: decryptSecret(smtp.pass)
    // and coerceFromStorage on smtp.port/smtp.secure - NOT a bad SMTP host,
    // since nodemailer.createTransport never connects (that already produced
    // a failed row via the pre-existing sendMail try/catch).
    const resolutionError = new Error('decryptSecret: bad ciphertext for smtp.pass');

    let mockCreateLog: jest.Mock;
    let mockMarkAsSent: jest.Mock;
    let mockMarkAsFailed: jest.Mock;
    let mockEmailLogService: any;
    let throwingProvider: jest.Mock;
    let providerEmailService: EmailService;

    beforeEach(() => {
      mockCreateLog = jest.fn().mockResolvedValue({ id: 'log-1' });
      mockMarkAsSent = jest.fn().mockResolvedValue(undefined);
      mockMarkAsFailed = jest.fn().mockResolvedValue(undefined);
      mockEmailLogService = {
        createLog: mockCreateLog,
        markAsSent: mockMarkAsSent,
        markAsFailed: mockMarkAsFailed,
      };
      throwingProvider = jest.fn().mockRejectedValue(resolutionError);
      providerEmailService = EmailService.withProvider(throwingProvider, mockEmailLogService);
    });

    it('creates a failed log row when config resolution throws, not just when sendMail throws', async () => {
      await expect(
        providerEmailService.sendSigningRequest({
          recipientEmail: 'signer@example.com',
          recipientName: 'John Doe',
          documentTitle: 'Contract',
          senderName: 'Alice',
          signingUrl: 'https://ezsign.com/sign/abc123',
        })
      ).rejects.toThrow(resolutionError);

      // The log row is created *before* resolveSendConfig() is attempted -
      // Item 2.1's whole point is that a resolution throw still leaves
      // visible evidence instead of no row at all.
      expect(mockCreateLog).toHaveBeenCalledTimes(1);
      expect(mockMarkAsFailed).toHaveBeenCalledWith('log-1', resolutionError.message);
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('still rethrows the original resolution error when markAsFailed itself throws (must not mask it with a DB error)', async () => {
      mockMarkAsFailed.mockRejectedValue(new Error('DB connection lost while writing email_logs'));

      await expect(
        providerEmailService.sendSigningRequest({
          recipientEmail: 'signer@example.com',
          recipientName: 'John Doe',
          documentTitle: 'Contract',
          senderName: 'Alice',
          signingUrl: 'https://ezsign.com/sign/abc123',
        })
      ).rejects.toThrow(resolutionError);
    });

    it('still rethrows the original send error (not the createLog/markAsFailed DB error) when sendMail itself fails', async () => {
      const sendError = new Error('SMTP connection refused');
      const workingProvider = jest.fn().mockResolvedValue({ ...mockConfig, baseUrl });
      const emailServiceWithWorkingConfig = EmailService.withProvider(workingProvider, mockEmailLogService);
      mockSendMail.mockRejectedValueOnce(sendError);

      await expect(
        emailServiceWithWorkingConfig.sendSigningRequest({
          recipientEmail: 'signer@example.com',
          recipientName: 'John Doe',
          documentTitle: 'Contract',
          senderName: 'Alice',
          signingUrl: 'https://ezsign.com/sign/abc123',
        })
      ).rejects.toThrow(sendError);

      expect(mockCreateLog).toHaveBeenCalledTimes(1);
      expect(mockMarkAsFailed).toHaveBeenCalledWith('log-1', sendError.message);
    });

    it('does not fail the send (or write a failed row) when markAsSent itself throws - the mail was already accepted by SMTP', async () => {
      const workingProvider = jest.fn().mockResolvedValue({ ...mockConfig });
      const emailServiceWithWorkingConfig = EmailService.withProvider(workingProvider, mockEmailLogService);
      mockMarkAsSent.mockRejectedValueOnce(new Error('DB connection lost while writing email_logs'));

      await expect(
        emailServiceWithWorkingConfig.sendSigningRequest({
          recipientEmail: 'signer@example.com',
          recipientName: 'John Doe',
          documentTitle: 'Contract',
          senderName: 'Alice',
          signingUrl: 'https://ezsign.com/sign/abc123',
        })
      ).resolves.toBeUndefined();

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      expect(mockMarkAsSent).toHaveBeenCalledTimes(1);
      // The whole point: a DB failure here must never turn an accepted send
      // into a `failed` row - that would cause a resend and a duplicate
      // email (with a live signing link) to the recipient.
      expect(mockMarkAsFailed).not.toHaveBeenCalled();
    });

    it('sendEmailVerification (the one previously-bypassed type) also gets a failed log row on a resolution throw', async () => {
      await expect(
        providerEmailService.sendEmailVerification({
          recipientEmail: 'user@example.com',
          recipientName: 'John Doe',
          verificationToken: 'abc123',
          baseUrl,
        })
      ).rejects.toThrow(resolutionError);

      expect(mockCreateLog).toHaveBeenCalledTimes(1);
      expect(mockCreateLog).toHaveBeenCalledWith(
        expect.objectContaining({ emailType: 'verification', recipientEmail: 'user@example.com' })
      );
      expect(mockMarkAsFailed).toHaveBeenCalledWith('log-1', resolutionError.message);
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  describe('sendCustomEmail - Item F3 (routed through sendWithLogging)', () => {
    it('creates a "welcome" email_logs row by default (no dedicated invitation type exists yet)', async () => {
      const mockCreateLog = jest.fn().mockResolvedValue({ id: 'log-1' });
      const mockMarkAsSent = jest.fn().mockResolvedValue(undefined);
      const mockMarkAsFailed = jest.fn().mockResolvedValue(undefined);
      const emailServiceWithLog = new EmailService(mockConfig, baseUrl, {
        createLog: mockCreateLog,
        markAsSent: mockMarkAsSent,
        markAsFailed: mockMarkAsFailed,
      } as any);

      await emailServiceWithLog.sendCustomEmail({
        to: 'invitee@example.com',
        subject: 'You are invited',
        html: '<p>Hi</p>',
        text: 'Hi',
      });

      expect(mockCreateLog).toHaveBeenCalledWith(
        expect.objectContaining({ recipientEmail: 'invitee@example.com', emailType: 'welcome' })
      );
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'invitee@example.com', subject: 'You are invited' })
      );
      expect(mockMarkAsSent).toHaveBeenCalledTimes(1);
    });

    it('honors an explicit emailType/context override instead of the "welcome" default', async () => {
      const mockCreateLog = jest.fn().mockResolvedValue({ id: 'log-1' });
      const mockMarkAsSent = jest.fn().mockResolvedValue(undefined);
      const mockMarkAsFailed = jest.fn().mockResolvedValue(undefined);
      const emailServiceWithLog = new EmailService(mockConfig, baseUrl, {
        createLog: mockCreateLog,
        markAsSent: mockMarkAsSent,
        markAsFailed: mockMarkAsFailed,
      } as any);

      await emailServiceWithLog.sendCustomEmail({
        to: 'user@example.com',
        subject: 'Custom',
        html: '<p>Hi</p>',
        text: 'Hi',
        emailType: 'verification',
        context: { userId: 'user-1' },
      });

      expect(mockCreateLog).toHaveBeenCalledWith(
        expect.objectContaining({ emailType: 'verification', userId: 'user-1' })
      );
    });

    it('records a failed email_logs row when sendMail throws, matching every other send path', async () => {
      const mockCreateLog = jest.fn().mockResolvedValue({ id: 'log-1' });
      const mockMarkAsSent = jest.fn().mockResolvedValue(undefined);
      const mockMarkAsFailed = jest.fn().mockResolvedValue(undefined);
      const emailServiceWithLog = new EmailService(mockConfig, baseUrl, {
        createLog: mockCreateLog,
        markAsSent: mockMarkAsSent,
        markAsFailed: mockMarkAsFailed,
      } as any);
      const sendError = new Error('SMTP connection refused');
      mockSendMail.mockRejectedValueOnce(sendError);

      await expect(
        emailServiceWithLog.sendCustomEmail({
          to: 'invitee@example.com',
          subject: 'You are invited',
          html: '<p>Hi</p>',
          text: 'Hi',
        })
      ).rejects.toThrow(sendError);

      expect(mockMarkAsFailed).toHaveBeenCalledWith('log-1', sendError.message);
    });
  });
});
