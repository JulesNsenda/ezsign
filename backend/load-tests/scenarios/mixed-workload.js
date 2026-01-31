import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { BASE_URL, TEST_USER, ENDPOINTS, url, getProfile } from '../config.js';

/**
 * Mixed Workload Load Test
 *
 * Simulates realistic user behavior with weighted operations:
 * - 40% Document browsing (list, view)
 * - 30% Document management (create, edit, delete)
 * - 20% Signing operations
 * - 10% Authentication (login, refresh)
 *
 * Run with:
 *   k6 run --env PROFILE=load scenarios/mixed-workload.js
 */

// Custom metrics
const operationDuration = new Trend('operation_duration');
const operationFailRate = new Rate('operation_failures');
const operationCounter = new Counter('operations_total');

// Get profile from environment
const profile = getProfile(__ENV.PROFILE || 'smoke');

export const options = {
  stages: profile.stages || [{ duration: profile.duration, target: profile.vus }],
  thresholds: {
    ...profile.thresholds,
    operation_duration: ['p(95)<1500'],
    operation_failures: ['rate<0.10'],
  },
};

// Operation weights (must sum to 100)
const OPERATIONS = [
  { name: 'browse', weight: 40, fn: browseDocs },
  { name: 'manage', weight: 30, fn: manageDocs },
  { name: 'sign', weight: 20, fn: simulateSigning },
  { name: 'auth', weight: 10, fn: authOperations },
];

// Build weighted selection array
function buildWeightedOperations() {
  const weighted = [];
  for (const op of OPERATIONS) {
    for (let i = 0; i < op.weight; i++) {
      weighted.push(op);
    }
  }
  return weighted;
}

const weightedOps = buildWeightedOperations();

// Setup: Login and get access token
export function setup() {
  console.log(`Running mixed workload test with profile: ${__ENV.PROFILE || 'smoke'}`);
  console.log('Operation weights:', OPERATIONS.map((o) => `${o.name}:${o.weight}%`).join(', '));

  const loginRes = http.post(
    url(ENDPOINTS.login),
    JSON.stringify({
      email: TEST_USER.email,
      password: TEST_USER.password,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (loginRes.status !== 200) {
    console.error(`Login failed: ${loginRes.status}`);
    return { token: null };
  }

  const body = JSON.parse(loginRes.body);
  return {
    token: body.accessToken,
    refreshToken: body.refreshToken,
  };
}

export default function (data) {
  if (!data.token) {
    sleep(1);
    return;
  }

  // Select random operation based on weights
  const op = weightedOps[Math.floor(Math.random() * 100)];

  const start = Date.now();
  const success = op.fn(data);
  const duration = Date.now() - start;

  operationDuration.add(duration);
  operationFailRate.add(!success);
  operationCounter.add(1, { operation: op.name });

  // Variable think time based on operation
  sleep(Math.random() * 3 + 1);
}

// Browse documents (40%)
function browseDocs(data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  let success = true;

  group('Browse Documents', function () {
    // List documents
    const listRes = http.get(url(ENDPOINTS.documents), {
      headers,
      tags: { name: 'browse_list' },
    });

    success = check(listRes, {
      'browse list status 200': (r) => r.status === 200,
    });

    if (!success) return;

    sleep(0.5);

    // Try to get a specific document if any exist
    try {
      const docs = JSON.parse(listRes.body).documents || [];
      if (docs.length > 0) {
        const randomDoc = docs[Math.floor(Math.random() * docs.length)];
        const getRes = http.get(url(ENDPOINTS.document(randomDoc.id)), {
          headers,
          tags: { name: 'browse_view' },
        });

        check(getRes, {
          'browse view status 200': (r) => r.status === 200,
        });
      }
    } catch {
      // Ignore parse errors
    }
  });

  return success;
}

// Manage documents (30%)
function manageDocs(data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  let success = true;

  group('Manage Documents', function () {
    // List existing documents
    const listRes = http.get(url(ENDPOINTS.documents), {
      headers,
      tags: { name: 'manage_list' },
    });

    success = check(listRes, {
      'manage list status 200': (r) => r.status === 200,
    });

    if (!success) return;

    sleep(0.3);

    // Update a random document if any exist
    try {
      const docs = JSON.parse(listRes.body).documents || [];
      const draftDocs = docs.filter((d) => d.status === 'draft');

      if (draftDocs.length > 0) {
        const randomDoc = draftDocs[Math.floor(Math.random() * draftDocs.length)];

        const updateRes = http.put(
          url(ENDPOINTS.document(randomDoc.id)),
          JSON.stringify({ title: `Updated ${Date.now()}` }),
          {
            headers,
            tags: { name: 'manage_update' },
          }
        );

        check(updateRes, {
          'manage update status 200': (r) => r.status === 200,
        });
      }
    } catch {
      // Ignore errors
    }
  });

  return success;
}

// Simulate signing (20%)
function simulateSigning(data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  let success = true;

  group('Signing Simulation', function () {
    // In a real test, this would access actual signing pages
    // For now, we simulate the API pattern

    // List documents to find pending ones
    const listRes = http.get(
      url(`${ENDPOINTS.documents}?status=pending`),
      {
        headers,
        tags: { name: 'signing_list_pending' },
      }
    );

    success = check(listRes, {
      'signing list status 200': (r) => r.status === 200,
    });

    if (!success) return;

    sleep(0.5);

    // Simulate checking document details
    try {
      const docs = JSON.parse(listRes.body).documents || [];
      if (docs.length > 0) {
        const randomDoc = docs[Math.floor(Math.random() * docs.length)];
        const getRes = http.get(url(ENDPOINTS.document(randomDoc.id)), {
          headers,
          tags: { name: 'signing_view_doc' },
        });

        check(getRes, {
          'signing view status 200': (r) => r.status === 200,
        });
      }
    } catch {
      // Ignore errors
    }
  });

  return success;
}

// Authentication operations (10%)
function authOperations(data) {
  let success = true;

  group('Auth Operations', function () {
    // Get current user info
    const meRes = http.get(url(ENDPOINTS.me), {
      headers: {
        Authorization: `Bearer ${data.token}`,
        'Content-Type': 'application/json',
      },
      tags: { name: 'auth_me' },
    });

    success = check(meRes, {
      'auth me status 200': (r) => r.status === 200,
    });

    if (!success) return;

    sleep(0.3);

    // Refresh token
    if (data.refreshToken) {
      const refreshRes = http.post(
        url(ENDPOINTS.refresh),
        JSON.stringify({ refreshToken: data.refreshToken }),
        {
          headers: { 'Content-Type': 'application/json' },
          tags: { name: 'auth_refresh' },
        }
      );

      check(refreshRes, {
        'auth refresh status 200': (r) => r.status === 200,
      });
    }
  });

  return success;
}

export function teardown(data) {
  console.log('Mixed workload test completed');
}
