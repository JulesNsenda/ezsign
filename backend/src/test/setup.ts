/**
 * Jest test setup file
 * This file runs before each test file
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.API_KEY_SECRET = 'test-api-key-secret-do-not-use-in-production';
process.env.WEBHOOK_SECRET = 'test-webhook-secret-do-not-use-in-production';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  // Keep error and warn for debugging
  error: console.error,
  warn: console.warn,
};

// Setup global test timeout
jest.setTimeout(10000);

// Add custom matchers if needed
expect.extend({
  // Custom matchers can be added here
});
