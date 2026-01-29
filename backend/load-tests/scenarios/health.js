import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { BASE_URL, ENDPOINTS, url, getProfile } from '../config.js';

/**
 * Health Check Load Test
 *
 * Simple test to establish baseline performance metrics.
 * Tests the /health endpoint under various load conditions.
 *
 * Run with:
 *   k6 run --env PROFILE=load scenarios/health.js
 */

// Custom metrics
const healthDuration = new Trend('health_duration');
const healthFailRate = new Rate('health_failures');

// Get profile from environment
const profile = getProfile(__ENV.PROFILE || 'smoke');

export const options = {
  stages: profile.stages || [{ duration: profile.duration, target: profile.vus }],
  thresholds: {
    ...profile.thresholds,
    health_duration: ['p(95)<100', 'p(99)<200'],
    health_failures: ['rate<0.01'],
    http_req_duration: ['p(95)<100'],
  },
};

export function setup() {
  console.log(`Running health check load test with profile: ${__ENV.PROFILE || 'smoke'}`);
  console.log(`Base URL: ${BASE_URL}`);

  // Verify health endpoint is accessible
  const res = http.get(url(ENDPOINTS.health));
  if (res.status !== 200) {
    console.error(`Health endpoint not accessible: ${res.status}`);
  }

  return {};
}

export default function () {
  const start = Date.now();
  const res = http.get(url(ENDPOINTS.health), {
    tags: { name: 'health_check' },
  });
  const duration = Date.now() - start;
  healthDuration.add(duration);

  const success = check(res, {
    'health status is 200': (r) => r.status === 200,
    'health response time < 100ms': () => duration < 100,
    'health returns OK': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'ok' || body.status === 'healthy';
      } catch {
        return r.body.includes('ok') || r.body.includes('healthy');
      }
    },
  });

  healthFailRate.add(!success);

  // Minimal sleep for high-throughput testing
  sleep(0.1);
}

export function teardown() {
  console.log('Health check load test completed');
}
