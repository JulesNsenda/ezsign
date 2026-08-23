import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

/**
 * Regression tests for the response interceptor's 401 handling.
 *
 * The bug: the interceptor treated EVERY 401 as an expired session and did
 * `window.location.href = '/login'`. Submitting a wrong password on the login
 * page returned 401, which hard-reloaded the page, remounted the form, and
 * wiped the error message it was about to show - the user saw a cleared form
 * and no explanation. Observed live on https://ezsign.dropkit.sh.
 */
describe('apiClient 401 interceptor', () => {
  let apiClient: any;
  let rejectedHandler: (error: any) => Promise<any>;
  let assignedHref: string | undefined;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    assignedHref = undefined;

    // jsdom refuses real navigation; capture the assignment instead.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        set href(value: string) {
          assignedHref = value;
        },
        get href() {
          return assignedHref ?? 'http://localhost/login';
        },
      },
    });

    const mod = await import('./client');
    apiClient = mod.default;
    // Grab the rejection handler registered by the module.
    const handlers = (apiClient.interceptors.response as any).handlers;
    rejectedHandler = handlers[handlers.length - 1].rejected;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const unauthorized = (url: string) => ({
    response: { status: 401 },
    config: { url },
  });

  it('does NOT redirect when the login endpoint answers 401 (wrong password)', async () => {
    await expect(rejectedHandler(unauthorized('/auth/login'))).rejects.toBeDefined();

    // The form must survive to render its own "Login failed" message.
    expect(assignedHref).toBeUndefined();
  });

  it.each([
    '/auth/register',
    '/auth/verify-2fa',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/verify-email',
  ])('does NOT redirect when %s answers 401', async (url) => {
    await expect(rejectedHandler(unauthorized(url))).rejects.toBeDefined();
    expect(assignedHref).toBeUndefined();
  });

  it('DOES redirect on a 401 from a normal endpoint with no refresh token', async () => {
    await expect(rejectedHandler(unauthorized('/documents'))).rejects.toBeDefined();

    expect(assignedHref).toBe('/login');
  });

  it('DOES redirect on a 401 from /auth/change-password, which uses 400 for a wrong current password', async () => {
    await expect(rejectedHandler(unauthorized('/auth/change-password'))).rejects.toBeDefined();

    expect(assignedHref).toBe('/login');
  });

  it('clears stored tokens when a real session expires', async () => {
    localStorage.setItem('access_token', 'stale');

    await expect(rejectedHandler(unauthorized('/documents'))).rejects.toBeDefined();

    expect(localStorage.getItem('access_token')).toBeNull();
  });
});
