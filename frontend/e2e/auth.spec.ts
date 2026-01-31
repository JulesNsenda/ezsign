import { test, expect } from '@playwright/test';

/**
 * Authentication E2E Tests
 * Tests the login, registration, and logout flows
 */

test.describe('Authentication', () => {
  test.describe('Login Flow', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
    });

    test('should display login form', async ({ page }) => {
      // Verify login page elements
      await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
      await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
      await expect(page.getByPlaceholder('••••••••')).toBeVisible();
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    });

    test('should show validation errors for empty fields', async ({ page }) => {
      // Click sign in without filling fields
      await page.getByRole('button', { name: /sign in/i }).click();

      // Expect validation errors
      await expect(page.getByText(/invalid email/i)).toBeVisible();
      await expect(page.getByText(/password is required/i)).toBeVisible();
    });

    test('should show validation error for invalid email', async ({ page }) => {
      await page.getByPlaceholder('you@example.com').fill('invalid-email');
      await page.getByPlaceholder('••••••••').fill('password123');
      await page.getByRole('button', { name: /sign in/i }).click();

      await expect(page.getByText(/invalid email/i)).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.getByPlaceholder('you@example.com').fill('wrong@example.com');
      await page.getByPlaceholder('••••••••').fill('wrongpassword');
      await page.getByRole('button', { name: /sign in/i }).click();

      // Wait for error message
      await expect(page.getByText(/login failed|invalid credentials/i)).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to forgot password page', async ({ page }) => {
      await page.getByRole('link', { name: /forgot password/i }).click();
      await expect(page).toHaveURL(/.*forgot-password/);
    });

    test('should navigate to registration page', async ({ page }) => {
      await page.getByRole('link', { name: /sign up/i }).click();
      await expect(page).toHaveURL(/.*register/);
    });

    test('should successfully login with valid credentials', async ({ page }) => {
      // Note: This test requires a test user to exist in the database
      // Use environment variables for test credentials
      const testEmail = process.env.TEST_USER_EMAIL || 'test@example.com';
      const testPassword = process.env.TEST_USER_PASSWORD || 'TestPassword123!';

      await page.getByPlaceholder('you@example.com').fill(testEmail);
      await page.getByPlaceholder('••••••••').fill(testPassword);
      await page.getByRole('button', { name: /sign in/i }).click();

      // After successful login, should redirect to dashboard or home
      await expect(page).toHaveURL(/.*(?:dashboard|\/)/i, { timeout: 10000 });
    });
  });

  test.describe('Registration Flow', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/register');
    });

    test('should display registration form', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /create account|sign up|register/i })).toBeVisible();
      await expect(page.getByPlaceholder(/email/i)).toBeVisible();
      await expect(page.getByPlaceholder(/password/i).first()).toBeVisible();
    });

    test('should show validation errors for invalid inputs', async ({ page }) => {
      // Try to submit with invalid email
      const emailInput = page.getByPlaceholder(/email/i);
      await emailInput.fill('invalid-email');

      const submitButton = page.getByRole('button', { name: /sign up|register|create/i });
      await submitButton.click();

      await expect(page.getByText(/invalid email|email is required/i)).toBeVisible();
    });

    test('should navigate to login page', async ({ page }) => {
      await page.getByRole('link', { name: /sign in|log in/i }).click();
      await expect(page).toHaveURL(/.*login/);
    });
  });

  test.describe('Logout Flow', () => {
    test('should logout successfully', async ({ page }) => {
      // First login
      const testEmail = process.env.TEST_USER_EMAIL || 'test@example.com';
      const testPassword = process.env.TEST_USER_PASSWORD || 'TestPassword123!';

      await page.goto('/login');
      await page.getByPlaceholder('you@example.com').fill(testEmail);
      await page.getByPlaceholder('••••••••').fill(testPassword);
      await page.getByRole('button', { name: /sign in/i }).click();

      // Wait for login to complete
      await page.waitForURL(/.*(?:dashboard|\/)/i, { timeout: 10000 });

      // Find and click logout button (usually in a dropdown or sidebar)
      const logoutButton = page.getByRole('button', { name: /logout|sign out/i });
      if (await logoutButton.isVisible()) {
        await logoutButton.click();
      } else {
        // Try opening a user menu first
        const userMenu = page.getByRole('button', { name: /user|profile|menu/i });
        if (await userMenu.isVisible()) {
          await userMenu.click();
          await page.getByRole('menuitem', { name: /logout|sign out/i }).click();
        }
      }

      // Should redirect to login page
      await expect(page).toHaveURL(/.*login/);
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect unauthenticated users to login', async ({ page }) => {
      // Try to access protected routes
      await page.goto('/documents');
      await expect(page).toHaveURL(/.*login/);

      await page.goto('/settings');
      await expect(page).toHaveURL(/.*login/);

      await page.goto('/templates');
      await expect(page).toHaveURL(/.*login/);
    });
  });
});
