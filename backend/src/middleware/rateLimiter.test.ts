import { Request } from 'express';
import { getKeyGenerator, getMaxRequests, RATE_LIMIT_TIERS } from './rateLimiter';

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('rateLimiter key/tier selection', () => {
  describe('X-API-Key spoofing (SEC: apiLimiter bypass)', () => {
    it('getKeyGenerator ignores an unauthenticated x-api-key header and falls back to IP', () => {
      const req = {
        headers: { 'x-api-key': 'totally-made-up-value' },
        ip: '1.2.3.4',
      } as unknown as Request;

      expect(getKeyGenerator(req)).toBe('anon:1.2.3.4');
    });

    it('getMaxRequests ignores an unauthenticated x-api-key header and grants the anonymous tier, not apiKey', () => {
      const req = {
        headers: { 'x-api-key': 'totally-made-up-value' },
        ip: '1.2.3.4',
      } as unknown as Request;

      expect(getMaxRequests(req)).toBe(RATE_LIMIT_TIERS.anonymous.max);
      expect(getMaxRequests(req)).not.toBe(RATE_LIMIT_TIERS.apiKey.max);
    });

    it('a fresh spoofed header on every request still keys on the same IP (no fresh-bucket-per-request bypass)', () => {
      const reqA = {
        headers: { 'x-api-key': 'random-value-1' },
        ip: '1.2.3.4',
      } as unknown as Request;
      const reqB = {
        headers: { 'x-api-key': 'random-value-2' },
        ip: '1.2.3.4',
      } as unknown as Request;

      expect(getKeyGenerator(reqA)).toBe(getKeyGenerator(reqB));
    });
  });

  describe('authenticated API key identity (req.apiKey set by apiKeyAuth middleware)', () => {
    it('getKeyGenerator keys on the verified apiKey id, not the raw header', () => {
      const req = {
        headers: { 'x-api-key': 'raw-header-value-should-be-ignored' },
        apiKey: { id: 'key-1', userId: 'user-1', name: 'test key', scopes: [] },
        ip: '1.2.3.4',
      } as unknown as Request;

      expect(getKeyGenerator(req)).toBe('apikey:key-1');
    });

    it('getMaxRequests grants the elevated apiKey tier only for a verified identity', () => {
      // Deliberately no `x-api-key` header on this request - the previous
      // version of this test included one, which meant it passed against
      // BOTH the fixed code (checks `req.apiKey?.id`) and the old vulnerable
      // code (checks `req.headers['x-api-key']` truthiness) equally, since
      // both signals were present at once. That made the test incapable of
      // detecting a revert. With `req.apiKey.id` as the *only* signal
      // present, the old code falls through to the anonymous tier (no
      // `x-api-key` header to check) while the fixed code still grants the
      // apiKey tier from `req.apiKey.id` alone - so a revert now shows up as
      // a real failure.
      const req = {
        headers: {},
        apiKey: { id: 'key-1', userId: 'user-1', name: 'test key', scopes: [] },
        ip: '1.2.3.4',
      } as unknown as Request;

      // Guards against the discrimination going silently vacuous if the
      // anonymous and apiKey tiers were ever configured to the same value.
      expect(RATE_LIMIT_TIERS.anonymous.max).not.toBe(RATE_LIMIT_TIERS.apiKey.max);

      expect(getMaxRequests(req)).toBe(RATE_LIMIT_TIERS.apiKey.max);
    });
  });

  describe('JWT authentication', () => {
    it('getKeyGenerator keys on the user id when no apiKey identity is present', () => {
      const req = {
        headers: {},
        user: { userId: 'user-42' },
        ip: '1.2.3.4',
      } as unknown as Request;

      expect(getKeyGenerator(req)).toBe('user:user-42');
    });

    it('getMaxRequests grants the authenticated tier when no apiKey identity is present', () => {
      const req = {
        headers: {},
        user: { userId: 'user-42' },
        ip: '1.2.3.4',
      } as unknown as Request;

      expect(getMaxRequests(req)).toBe(RATE_LIMIT_TIERS.authenticated.max);
    });
  });

  describe('anonymous fallback', () => {
    it('getKeyGenerator falls back to the socket address when req.ip is unavailable', () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '5.6.7.8' },
      } as unknown as Request;

      expect(getKeyGenerator(req)).toBe('anon:5.6.7.8');
    });

    it('getMaxRequests grants the anonymous tier for a fully unauthenticated request', () => {
      const req = {
        headers: {},
        ip: '1.2.3.4',
      } as unknown as Request;

      expect(getMaxRequests(req)).toBe(RATE_LIMIT_TIERS.anonymous.max);
    });
  });

  describe('IPv6 rate-limit bypass (raw req.ip is not a safe key)', () => {
    const ipReq = (ip: string) => ({ headers: {}, ip }) as unknown as Request;

    it('collapses two addresses from the same IPv6 /56 to a single key', () => {
      // A client is typically handed a whole /64 or wider prefix, so keying on
      // the raw address lets it rotate through effectively unlimited IPs and
      // evade every limiter. Both of these must land in the same bucket.
      const a = getKeyGenerator(ipReq('2001:db8:85a3:0000:1319:8a2e:370:7348'));
      const b = getKeyGenerator(ipReq('2001:db8:85a3:0055:ffff:ffff:ffff:ffff'));

      expect(a).toBe(b);
      expect(a).not.toBe('anon:2001:db8:85a3:0000:1319:8a2e:370:7348');
    });

    it('still separates addresses from different IPv6 /56 prefixes', () => {
      const a = getKeyGenerator(ipReq('2001:db8:85a3:0000:1319:8a2e:370:7348'));
      const b = getKeyGenerator(ipReq('2001:db8:85a3:ff00:1319:8a2e:370:7348'));

      expect(a).not.toBe(b);
    });

    it('passes IPv4 addresses through unchanged', () => {
      expect(getKeyGenerator(ipReq('1.2.3.4'))).toBe('anon:1.2.3.4');
    });
  });
});
