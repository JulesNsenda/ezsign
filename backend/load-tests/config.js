/**
 * k6 Load Testing Configuration
 *
 * This file contains shared configuration for all load tests.
 * Environment variables can override these defaults.
 */

// Base URL for the API
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

// Test user credentials (should be created before running tests)
export const TEST_USER = {
  email: __ENV.TEST_USER_EMAIL || 'loadtest@example.com',
  password: __ENV.TEST_USER_PASSWORD || 'LoadTest123!',
};

// Load test profiles
export const PROFILES = {
  // Smoke test: Verify system works under minimal load
  smoke: {
    vus: 1,
    duration: '30s',
    thresholds: {
      http_req_duration: ['p(95)<500'],
      http_req_failed: ['rate<0.01'],
    },
  },

  // Load test: Normal expected load
  load: {
    stages: [
      { duration: '1m', target: 10 },   // Ramp up to 10 users
      { duration: '3m', target: 10 },   // Stay at 10 users
      { duration: '1m', target: 20 },   // Ramp up to 20 users
      { duration: '3m', target: 20 },   // Stay at 20 users
      { duration: '1m', target: 0 },    // Ramp down
    ],
    thresholds: {
      http_req_duration: ['p(95)<1000', 'p(99)<2000'],
      http_req_failed: ['rate<0.05'],
    },
  },

  // Stress test: Find breaking point
  stress: {
    stages: [
      { duration: '2m', target: 10 },   // Ramp up
      { duration: '5m', target: 10 },   // Stay
      { duration: '2m', target: 20 },   // Ramp up
      { duration: '5m', target: 20 },   // Stay
      { duration: '2m', target: 30 },   // Ramp up
      { duration: '5m', target: 30 },   // Stay
      { duration: '2m', target: 40 },   // Ramp up
      { duration: '5m', target: 40 },   // Stay
      { duration: '5m', target: 0 },    // Ramp down
    ],
    thresholds: {
      http_req_duration: ['p(95)<2000'],
      http_req_failed: ['rate<0.10'],
    },
  },

  // Spike test: Sudden traffic surge
  spike: {
    stages: [
      { duration: '30s', target: 5 },   // Normal load
      { duration: '10s', target: 50 },  // Spike!
      { duration: '1m', target: 50 },   // Stay at spike
      { duration: '10s', target: 5 },   // Back to normal
      { duration: '1m', target: 5 },    // Recovery
      { duration: '30s', target: 0 },   // Ramp down
    ],
    thresholds: {
      http_req_duration: ['p(95)<3000'],
      http_req_failed: ['rate<0.15'],
    },
  },

  // Soak test: Extended duration for memory leaks
  soak: {
    stages: [
      { duration: '2m', target: 10 },   // Ramp up
      { duration: '30m', target: 10 },  // Extended duration
      { duration: '2m', target: 0 },    // Ramp down
    ],
    thresholds: {
      http_req_duration: ['p(95)<1500'],
      http_req_failed: ['rate<0.05'],
    },
  },
};

// Default thresholds applied to all tests
export const DEFAULT_THRESHOLDS = {
  http_req_duration: ['p(95)<1000'],  // 95% of requests under 1s
  http_req_failed: ['rate<0.05'],     // Less than 5% failure rate
  http_reqs: ['rate>10'],             // At least 10 requests per second
};

// API endpoints
export const ENDPOINTS = {
  // Auth
  login: '/api/auth/login',
  register: '/api/auth/register',
  refresh: '/api/auth/refresh',
  logout: '/api/auth/logout',
  me: '/api/auth/me',

  // Documents
  documents: '/api/documents',
  document: (id) => `/api/documents/${id}`,
  documentFields: (id) => `/api/documents/${id}/fields`,
  documentSigners: (id) => `/api/documents/${id}/signers`,
  documentSend: (id) => `/api/documents/${id}/send`,

  // Templates
  templates: '/api/templates',
  template: (id) => `/api/templates/${id}`,

  // Signing
  sign: (token) => `/api/sign/${token}`,
  signField: (token, fieldId) => `/api/sign/${token}/fields/${fieldId}`,
  signComplete: (token) => `/api/sign/${token}/complete`,

  // Health
  health: '/health',
};

// Helper to get profile by name
export function getProfile(name) {
  const profile = PROFILES[name];
  if (!profile) {
    console.warn(`Profile '${name}' not found, using 'smoke'`);
    return PROFILES.smoke;
  }
  return profile;
}

// Helper to build full URL
export function url(path) {
  return `${BASE_URL}${path}`;
}
