import { FullConfig } from '@playwright/test';

/**
 * Global setup for Playwright E2E tests
 * Runs once before all tests
 */
async function globalSetup(config: FullConfig) {
  // Log test environment info
  console.log('Running E2E tests with configuration:');
  console.log(`  Base URL: ${config.projects[0]?.use?.baseURL || 'Not set'}`);
  console.log(`  Workers: ${config.workers}`);
  console.log(`  Projects: ${config.projects.map(p => p.name).join(', ')}`);

  // Environment validation
  const requiredEnvVars = ['VITE_API_URL'];
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);

  if (missingVars.length > 0) {
    console.warn(`Warning: Missing environment variables: ${missingVars.join(', ')}`);
    console.warn('Some tests may be skipped without proper test credentials.');
  }

  // Optional test user setup
  if (process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD) {
    console.log('  Test user configured: Yes');
  } else {
    console.log('  Test user configured: No (some tests will be skipped)');
  }

  if (process.env.TEST_SIGNING_TOKEN) {
    console.log('  Test signing token: Yes');
  } else {
    console.log('  Test signing token: No (signing tests will be skipped)');
  }
}

export default globalSetup;
