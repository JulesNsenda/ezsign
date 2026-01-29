import { EmailService, EmailConfig } from './emailService';

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
});
