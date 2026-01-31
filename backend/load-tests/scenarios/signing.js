import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { BASE_URL, TEST_USER, ENDPOINTS, url, getProfile } from '../config.js';

/**
 * Signing Flow Load Test Scenarios
 *
 * Tests the complete signing workflow from token validation to signature submission.
 * Note: This test requires documents to be pre-created with valid signing tokens.
 *
 * Run with:
 *   k6 run --env PROFILE=load --env SIGN_TOKEN=<token> scenarios/signing.js
 */

// Custom metrics
const getSigningPageDuration = new Trend('get_signing_page_duration');
const submitSignatureDuration = new Trend('submit_signature_duration');
const completeSigningDuration = new Trend('complete_signing_duration');
const signingFailRate = new Rate('signing_failures');

// Get profile from environment
const profile = getProfile(__ENV.PROFILE || 'smoke');

export const options = {
  stages: profile.stages || [{ duration: profile.duration, target: profile.vus }],
  thresholds: {
    ...profile.thresholds,
    get_signing_page_duration: ['p(95)<1000'],
    submit_signature_duration: ['p(95)<1500'],
    complete_signing_duration: ['p(95)<2000'],
    signing_failures: ['rate<0.05'],
  },
};

// Setup: Prepare test signing sessions
export function setup() {
  console.log(`Running signing load test with profile: ${__ENV.PROFILE || 'smoke'}`);

  // If a signing token is provided, use it
  if (__ENV.SIGN_TOKEN) {
    console.log('Using provided signing token');
    return { tokens: [__ENV.SIGN_TOKEN] };
  }

  // Otherwise, we need to create test documents and get signing tokens
  console.log('Creating test documents for signing...');

  // Login to get access token
  const loginRes = http.post(
    url(ENDPOINTS.login),
    JSON.stringify({
      email: TEST_USER.email,
      password: TEST_USER.password,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (loginRes.status !== 200) {
    console.error('Login failed, cannot create test documents');
    return { tokens: [], accessToken: null };
  }

  const { accessToken } = JSON.parse(loginRes.body);

  // Note: In a real scenario, you would create documents and send them
  // for signing to get valid tokens. For this test, we'll simulate
  // the signing page access without actual document creation.

  return {
    tokens: [],
    accessToken,
    message: 'No pre-created tokens. Run with --env SIGN_TOKEN=<token> for real signing tests.',
  };
}

export default function (data) {
  // If we have signing tokens, test the full signing flow
  if (data.tokens && data.tokens.length > 0) {
    const token = data.tokens[Math.floor(Math.random() * data.tokens.length)];
    testSigningFlow(token);
  } else {
    // Otherwise, test the signing page access patterns (without actual signing)
    testSigningPagePatterns(data.accessToken);
  }

  // Think time between iterations
  sleep(Math.random() * 2 + 1);
}

function testSigningFlow(token) {
  group('Get Signing Page', function () {
    const start = Date.now();
    const res = http.get(url(ENDPOINTS.sign(token)), {
      tags: { name: 'get_signing_page' },
    });
    const duration = Date.now() - start;
    getSigningPageDuration.add(duration);

    const success = check(res, {
      'signing page status 200': (r) => r.status === 200,
      'signing page returns document': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.document && body.fields;
        } catch {
          return false;
        }
      },
    });

    signingFailRate.add(!success);

    if (!success) {
      console.log(`Signing page failed: ${res.status}`);
      return;
    }

    sleep(0.5);

    // Get field IDs from response
    let fields = [];
    try {
      fields = JSON.parse(res.body).fields || [];
    } catch {
      return;
    }

    // Submit signatures for each field
    for (const field of fields) {
      if (field.type === 'signature' || field.type === 'initials') {
        submitSignature(token, field);
      } else if (field.type === 'date') {
        submitDate(token, field);
      } else if (field.type === 'text') {
        submitText(token, field);
      }
    }
  });

  group('Complete Signing', function () {
    const start = Date.now();
    const res = http.post(
      url(ENDPOINTS.signComplete(token)),
      JSON.stringify({}),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'complete_signing' },
      }
    );
    const duration = Date.now() - start;
    completeSigningDuration.add(duration);

    const success = check(res, {
      'complete signing status 200': (r) => r.status === 200,
    });

    signingFailRate.add(!success);
  });
}

function submitSignature(token, field) {
  // Base64 encoded minimal signature image
  const signatureData = {
    signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  };

  const start = Date.now();
  const res = http.post(
    url(ENDPOINTS.signField(token, field.id)),
    JSON.stringify(signatureData),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'submit_signature' },
    }
  );
  const duration = Date.now() - start;
  submitSignatureDuration.add(duration);

  check(res, {
    'submit signature status 200': (r) => r.status === 200,
  });

  sleep(0.3);
}

function submitDate(token, field) {
  const dateData = {
    value: new Date().toISOString().split('T')[0],
  };

  const res = http.post(
    url(ENDPOINTS.signField(token, field.id)),
    JSON.stringify(dateData),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'submit_date' },
    }
  );

  check(res, {
    'submit date status 200': (r) => r.status === 200,
  });

  sleep(0.2);
}

function submitText(token, field) {
  const textData = {
    value: 'Test Text Value',
  };

  const res = http.post(
    url(ENDPOINTS.signField(token, field.id)),
    JSON.stringify(textData),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'submit_text' },
    }
  );

  check(res, {
    'submit text status 200': (r) => r.status === 200,
  });

  sleep(0.2);
}

// Test signing-related API patterns without actual signing
function testSigningPagePatterns(accessToken) {
  if (!accessToken) {
    sleep(1);
    return;
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  group('API Pattern Tests', function () {
    // Test document listing (signers perspective simulation)
    const listRes = http.get(url(ENDPOINTS.documents), {
      headers,
      tags: { name: 'list_documents_for_signing' },
    });

    check(listRes, {
      'list for signing status 200': (r) => r.status === 200,
    });

    sleep(0.3);

    // Test health endpoint
    const healthRes = http.get(url(ENDPOINTS.health), {
      tags: { name: 'health_check' },
    });

    check(healthRes, {
      'health check status 200': (r) => r.status === 200,
    });

    sleep(0.2);
  });
}

export function teardown(data) {
  console.log('Signing load test completed');
  if (data.message) {
    console.log(data.message);
  }
}
