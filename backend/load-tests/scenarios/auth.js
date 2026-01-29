import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { BASE_URL, TEST_USER, ENDPOINTS, url, getProfile } from '../config.js';

/**
 * Authentication Load Test Scenarios
 *
 * Tests login, token refresh, and logout endpoints under load.
 *
 * Run with:
 *   k6 run --env PROFILE=load scenarios/auth.js
 *   k6 run --env PROFILE=stress scenarios/auth.js
 */

// Custom metrics
const loginDuration = new Trend('login_duration');
const loginFailRate = new Rate('login_failures');
const refreshDuration = new Trend('refresh_duration');
const refreshFailRate = new Rate('refresh_failures');

// Get profile from environment
const profile = getProfile(__ENV.PROFILE || 'smoke');

export const options = {
  stages: profile.stages || [{ duration: profile.duration, target: profile.vus }],
  thresholds: {
    ...profile.thresholds,
    login_duration: ['p(95)<500'],
    login_failures: ['rate<0.05'],
    refresh_duration: ['p(95)<300'],
    refresh_failures: ['rate<0.05'],
  },
};

// Setup: Create test user if needed (runs once)
export function setup() {
  console.log(`Running auth load test with profile: ${__ENV.PROFILE || 'smoke'}`);
  console.log(`Base URL: ${BASE_URL}`);

  // Try to register test user (ignore if already exists)
  const registerRes = http.post(
    url(ENDPOINTS.register),
    JSON.stringify({
      email: TEST_USER.email,
      password: TEST_USER.password,
      name: 'Load Test User',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (registerRes.status === 201) {
    console.log('Test user created');
  } else if (registerRes.status === 409) {
    console.log('Test user already exists');
  } else {
    console.log(`Register response: ${registerRes.status}`);
  }

  return { email: TEST_USER.email, password: TEST_USER.password };
}

export default function (data) {
  let accessToken = null;
  let refreshToken = null;

  group('Login Flow', function () {
    // Test login endpoint
    const loginStart = Date.now();
    const loginRes = http.post(
      url(ENDPOINTS.login),
      JSON.stringify({
        email: data.email,
        password: data.password,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'login' },
      }
    );
    const loginTime = Date.now() - loginStart;
    loginDuration.add(loginTime);

    const loginSuccess = check(loginRes, {
      'login status is 200': (r) => r.status === 200,
      'login returns tokens': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.accessToken && body.refreshToken;
        } catch {
          return false;
        }
      },
      'login time < 500ms': () => loginTime < 500,
    });

    loginFailRate.add(!loginSuccess);

    if (loginSuccess) {
      const body = JSON.parse(loginRes.body);
      accessToken = body.accessToken;
      refreshToken = body.refreshToken;
    }

    sleep(0.5);
  });

  if (accessToken) {
    group('Authenticated Requests', function () {
      // Test /me endpoint
      const meRes = http.get(url(ENDPOINTS.me), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        tags: { name: 'me' },
      });

      check(meRes, {
        'me status is 200': (r) => r.status === 200,
        'me returns user data': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.email === data.email;
          } catch {
            return false;
          }
        },
      });

      sleep(0.3);
    });

    group('Token Refresh', function () {
      // Test refresh endpoint
      const refreshStart = Date.now();
      const refreshRes = http.post(
        url(ENDPOINTS.refresh),
        JSON.stringify({ refreshToken }),
        {
          headers: { 'Content-Type': 'application/json' },
          tags: { name: 'refresh' },
        }
      );
      const refreshTime = Date.now() - refreshStart;
      refreshDuration.add(refreshTime);

      const refreshSuccess = check(refreshRes, {
        'refresh status is 200': (r) => r.status === 200,
        'refresh returns new token': (r) => {
          try {
            const body = JSON.parse(r.body);
            return !!body.accessToken;
          } catch {
            return false;
          }
        },
        'refresh time < 300ms': () => refreshTime < 300,
      });

      refreshFailRate.add(!refreshSuccess);

      if (refreshSuccess) {
        accessToken = JSON.parse(refreshRes.body).accessToken;
      }

      sleep(0.3);
    });

    group('Logout', function () {
      // Test logout endpoint
      const logoutRes = http.post(
        url(ENDPOINTS.logout),
        JSON.stringify({ refreshToken }),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          tags: { name: 'logout' },
        }
      );

      check(logoutRes, {
        'logout status is 200 or 204': (r) => r.status === 200 || r.status === 204,
      });

      sleep(0.2);
    });
  }

  // Think time between iterations
  sleep(Math.random() * 2 + 1);
}

export function teardown(data) {
  console.log('Auth load test completed');
}
