import { categorizeSmtpError } from './smtpErrorCategorizer';

describe('categorizeSmtpError', () => {
  it('categorizes an auth failure without leaking credential-adjacent text', () => {
    expect(categorizeSmtpError('535 Invalid login: authentication failed')).toBe(
      'Authentication failed'
    );
    expect(categorizeSmtpError({ code: 'EAUTH' })).toBe('Authentication failed');
  });

  it('categorizes a connection failure without leaking host/port', () => {
    expect(categorizeSmtpError('connect ECONNREFUSED 10.0.0.5:587')).toBe(
      'SMTP connection failed'
    );
    expect(categorizeSmtpError(new Error('Connection timed out'))).toBe('SMTP connection failed');
    expect(categorizeSmtpError({ code: 'ENOTFOUND' })).toBe('SMTP connection failed');
  });

  it('falls back to the generic message for anything else, using the default or a caller-supplied one', () => {
    // NOTE: '550 mailbox does not exist' used to land here. It is now
    // classified as 'Recipient address rejected' - a deliberate change, not a
    // regression: a rejected address is the sender's own input, so naming it
    // discloses nothing about the instance and is the whole point of the
    // activity timeline. See the recipient-side block below.
    expect(categorizeSmtpError('something entirely unrecognised')).toBe('Email delivery failed');
    expect(categorizeSmtpError('something entirely unrecognised', 'Failed to send test email')).toBe(
      'Failed to send test email'
    );
  });

  it('handles a null/undefined/unknown error without throwing', () => {
    expect(categorizeSmtpError(null)).toBe('Email delivery failed');
    expect(categorizeSmtpError(undefined)).toBe('Email delivery failed');
  });

  describe('recipient-side failures are named, not generalised', () => {
    // The activity timeline exists so a document owner can see *why* a send
    // failed. Transport categories describe the instance's mail setup and are
    // rightly withheld - but a rejected address is the owner's own input, and
    // collapsing it into "Email delivery failed" recreates the complaint the
    // feature answers.

    it.each([
      ['550 5.1.1 <a@b.com>: Recipient address rejected: User unknown', 'Recipient address rejected'],
      ['Message rejected: 553 sorry, that address does not exist', 'Recipient address rejected'],
      ['SMTP error 551 user not local', 'Recipient address rejected'],
      ['450 4.2.0 mailbox unavailable', 'Recipient address rejected'],
    ])('names a rejected recipient: %s', (raw, expected) => {
      expect(categorizeSmtpError(raw)).toBe(expected);
    });

    it.each([
      ['552 5.2.2 Requested mail action aborted: exceeded storage allocation', 'Recipient mailbox is full'],
      ['452 4.2.2 over quota', 'Recipient mailbox is full'],
    ])('names a full mailbox: %s', (raw, expected) => {
      expect(categorizeSmtpError(raw)).toBe(expected);
    });

    it('names a missing recipient domain only when the relay reports one', () => {
      expect(categorizeSmtpError('550 5.1.2 Domain not found')).toBe('Recipient domain not found');
    });

    it('never names the instance host, whatever the failure', () => {
      const result = categorizeSmtpError('getaddrinfo ENOTFOUND smtp.internal.example');
      expect(result).toBe('SMTP connection failed');
      expect(result).not.toContain('smtp.internal.example');
    });

    it('never echoes the raw text for any recognised category', () => {
      const raw = '550 5.1.1 rejected by mx.internal.example for a@b.test';
      expect(categorizeSmtpError(raw)).not.toContain('mx.internal.example');
    });
  });

  describe('reply codes are parsed, not substring-matched', () => {
    // Each of these contains a digit run that a naive `includes()` check
    // treats as an SMTP reply code, and each is really a transport failure.
    // Misclassifying them tells an operator to fix the signer's address when
    // the instance's own mail setup is broken - the exact misdirection the
    // recipient categories were added to remove.
    it.each([
      ['Connection timed out after 5500 ms', 'SMTP connection failed'],
      ['connect ETIMEDOUT 195.1.16.4:587', 'SMTP connection failed'],
      ['connect ECONNREFUSED 127.0.0.1:5500', 'SMTP connection failed'],
      ['getaddrinfo ENOTFOUND smtp-host-at-195.1.16.4', 'SMTP connection failed'],
    ])('still reads %s as transport', (raw, expected) => {
      expect(categorizeSmtpError(raw)).toBe(expected);
    });

    it('reads a real leading reply code as a recipient rejection', () => {
      expect(categorizeSmtpError('550 5.1.1 <a@b.test>: User unknown')).toBe(
        'Recipient address rejected'
      );
    });
  });

  describe('a local DNS failure is never blamed on the recipient', () => {
    it("reads ENOTFOUND as transport, because it names the instance's own SMTP host", () => {
      // nodemailer connects to the configured SMTP host, not to the
      // recipient's MX, so `getaddrinfo ENOTFOUND` says nothing about the
      // recipient. The ordinary self-hosted case - host `smtp.example.com`,
      // recipient `@example.com` - is exactly where inferring otherwise
      // misfires, and it told the owner their signer's domain was missing
      // while the instance's own transport was down.
      expect(categorizeSmtpError('getaddrinfo ENOTFOUND smtp.example.com')).toBe(
        'SMTP connection failed'
      );
    });

    it('classifies on the error text alone, with no caller-supplied input', () => {
      // If the category varied with the recipient address - which the caller
      // chooses - it would be a one-bit oracle over the raw text that the
      // admin-only gate exists to withhold.
      expect(categorizeSmtpError.length).toBeLessThanOrEqual(2);
    });
  });

  it('still accepts a bare string as the fallback message (older signature)', () => {
    expect(categorizeSmtpError('something unrecognised', 'Failed to send test email')).toBe(
      'Failed to send test email'
    );
  });
});
