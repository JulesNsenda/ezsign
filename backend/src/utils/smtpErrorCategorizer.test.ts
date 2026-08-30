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
    expect(categorizeSmtpError('550 mailbox does not exist')).toBe('Email delivery failed');
    expect(categorizeSmtpError('550 mailbox does not exist', 'Failed to send test email')).toBe(
      'Failed to send test email'
    );
  });

  it('handles a null/undefined/unknown error without throwing', () => {
    expect(categorizeSmtpError(null)).toBe('Email delivery failed');
    expect(categorizeSmtpError(undefined)).toBe('Email delivery failed');
  });
});
