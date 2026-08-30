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

    it("names a DNS failure for the recipient's own domain", () => {
      expect(
        categorizeSmtpError(
          'getaddrinfo ENOTFOUND nonexistent-domain.invalid',
          undefined,
          'nonexistent-domain.invalid'
        )
      ).toBe('Recipient domain not found');
    });

    it("still reports a DNS failure for the instance's SMTP host as a transport problem", () => {
      // The hostname is the instance's, not the recipient's - the reader must
      // not be pointed at the address they typed, and the host must not be
      // named.
      const result = categorizeSmtpError(
        'getaddrinfo ENOTFOUND smtp.internal.example',
        undefined,
        'recipient-domain.test'
      );
      expect(result).toBe('SMTP connection failed');
      expect(result).not.toContain('smtp.internal.example');
    });

    it('never echoes the raw text for any recognised category', () => {
      const raw = '550 5.1.1 rejected by mx.internal.example for a@b.test';
      expect(categorizeSmtpError(raw)).not.toContain('mx.internal.example');
    });
  });
});
