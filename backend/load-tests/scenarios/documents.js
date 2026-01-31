import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { FormData } from 'https://jslib.k6.io/formdata/0.0.2/index.js';
import { BASE_URL, TEST_USER, ENDPOINTS, url, getProfile } from '../config.js';

/**
 * Document Operations Load Test Scenarios
 *
 * Tests document CRUD operations, field management, and signer management.
 *
 * Run with:
 *   k6 run --env PROFILE=load scenarios/documents.js
 */

// Custom metrics
const listDocsDuration = new Trend('list_docs_duration');
const createDocDuration = new Trend('create_doc_duration');
const getDocDuration = new Trend('get_doc_duration');
const addFieldDuration = new Trend('add_field_duration');
const docOperationFailRate = new Rate('doc_operation_failures');

// Get profile from environment
const profile = getProfile(__ENV.PROFILE || 'smoke');

export const options = {
  stages: profile.stages || [{ duration: profile.duration, target: profile.vus }],
  thresholds: {
    ...profile.thresholds,
    list_docs_duration: ['p(95)<1000'],
    create_doc_duration: ['p(95)<2000'],
    get_doc_duration: ['p(95)<500'],
    add_field_duration: ['p(95)<500'],
    doc_operation_failures: ['rate<0.05'],
  },
};

// Minimal valid PDF for testing (smallest valid PDF)
const MINIMAL_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
trailer<</Size 4/Root 1 0 R>>
startxref
170
%%EOF`;

// Setup: Login and get access token
export function setup() {
  console.log(`Running documents load test with profile: ${__ENV.PROFILE || 'smoke'}`);

  // Login to get token
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

  const { accessToken } = JSON.parse(loginRes.body);
  console.log('Login successful');

  return { token: accessToken };
}

export default function (data) {
  if (!data.token) {
    console.error('No access token available');
    sleep(1);
    return;
  }

  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  let documentId = null;
  let fieldId = null;

  group('List Documents', function () {
    const start = Date.now();
    const res = http.get(url(ENDPOINTS.documents), {
      headers,
      tags: { name: 'list_documents' },
    });
    const duration = Date.now() - start;
    listDocsDuration.add(duration);

    const success = check(res, {
      'list documents status 200': (r) => r.status === 200,
      'list documents returns array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.documents);
        } catch {
          return false;
        }
      },
    });

    docOperationFailRate.add(!success);
    sleep(0.3);
  });

  group('Create Document', function () {
    // Create document with minimal PDF
    const fd = new FormData();
    fd.append('file', http.file(MINIMAL_PDF, 'test-document.pdf', 'application/pdf'));
    fd.append('title', `Load Test Doc ${Date.now()}`);

    const start = Date.now();
    const res = http.post(url(ENDPOINTS.documents), fd.body(), {
      headers: {
        Authorization: `Bearer ${data.token}`,
        'Content-Type': fd.contentType,
      },
      tags: { name: 'create_document' },
    });
    const duration = Date.now() - start;
    createDocDuration.add(duration);

    const success = check(res, {
      'create document status 201': (r) => r.status === 201,
      'create document returns id': (r) => {
        try {
          const body = JSON.parse(r.body);
          documentId = body.id;
          return !!documentId;
        } catch {
          return false;
        }
      },
    });

    docOperationFailRate.add(!success);
    sleep(0.5);
  });

  if (documentId) {
    group('Get Document', function () {
      const start = Date.now();
      const res = http.get(url(ENDPOINTS.document(documentId)), {
        headers,
        tags: { name: 'get_document' },
      });
      const duration = Date.now() - start;
      getDocDuration.add(duration);

      const success = check(res, {
        'get document status 200': (r) => r.status === 200,
        'get document returns data': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.id === documentId;
          } catch {
            return false;
          }
        },
      });

      docOperationFailRate.add(!success);
      sleep(0.3);
    });

    group('Add Field to Document', function () {
      const fieldData = {
        type: 'signature',
        page: 1,
        x: 100,
        y: 100,
        width: 200,
        height: 50,
        required: true,
      };

      const start = Date.now();
      const res = http.post(
        url(ENDPOINTS.documentFields(documentId)),
        JSON.stringify(fieldData),
        {
          headers,
          tags: { name: 'add_field' },
        }
      );
      const duration = Date.now() - start;
      addFieldDuration.add(duration);

      const success = check(res, {
        'add field status 201': (r) => r.status === 201,
        'add field returns id': (r) => {
          try {
            const body = JSON.parse(r.body);
            fieldId = body.id;
            return !!fieldId;
          } catch {
            return false;
          }
        },
      });

      docOperationFailRate.add(!success);
      sleep(0.3);
    });

    group('Add Signer to Document', function () {
      const signerData = {
        email: `signer-${Date.now()}@example.com`,
        name: 'Test Signer',
        order: 1,
      };

      const res = http.post(
        url(ENDPOINTS.documentSigners(documentId)),
        JSON.stringify(signerData),
        {
          headers,
          tags: { name: 'add_signer' },
        }
      );

      const success = check(res, {
        'add signer status 201': (r) => r.status === 201,
      });

      docOperationFailRate.add(!success);
      sleep(0.3);
    });

    group('Update Document', function () {
      const updateData = {
        title: `Updated Doc ${Date.now()}`,
      };

      const res = http.put(
        url(ENDPOINTS.document(documentId)),
        JSON.stringify(updateData),
        {
          headers,
          tags: { name: 'update_document' },
        }
      );

      check(res, {
        'update document status 200': (r) => r.status === 200,
      });

      sleep(0.3);
    });

    group('Delete Document', function () {
      const res = http.del(url(ENDPOINTS.document(documentId)), null, {
        headers,
        tags: { name: 'delete_document' },
      });

      check(res, {
        'delete document status 200 or 204': (r) =>
          r.status === 200 || r.status === 204,
      });

      sleep(0.2);
    });
  }

  // Think time between iterations
  sleep(Math.random() * 2 + 1);
}

export function teardown(data) {
  console.log('Documents load test completed');
}
