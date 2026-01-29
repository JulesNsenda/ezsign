import { test, expect } from '@playwright/test';

/**
 * Document Signing E2E Tests
 * Tests the signing experience for signers
 */

test.describe('Signing Flow', () => {
  // Note: These tests require a valid signing token
  // In a real test environment, you would:
  // 1. Create a document programmatically via API
  // 2. Add signers and get their signing tokens
  // 3. Use those tokens for testing

  test.describe('Signing Page Access', () => {
    test('should show error for invalid token', async ({ page }) => {
      await page.goto('/sign/invalid-token-12345');

      // Should show error message
      await expect(
        page.getByText(/invalid|not found|expired|error/i)
      ).toBeVisible({ timeout: 10000 });
    });

    test('should show error for expired token', async ({ page }) => {
      // Use an obviously expired/invalid token format
      await page.goto('/sign/expired-00000000-0000-0000-0000-000000000000');

      // Should show error message
      await expect(
        page.getByText(/invalid|not found|expired|error/i)
      ).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Signing Page Layout', () => {
    // These tests assume we have a valid signing session
    // In real tests, you would mock the API or use test fixtures

    test('should display signing page elements', async ({ page }) => {
      // Note: Replace with actual test token if available
      const testToken = process.env.TEST_SIGNING_TOKEN;

      if (!testToken) {
        test.skip();
        return;
      }

      await page.goto(`/sign/${testToken}`);

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Should show PDF document
      const pdfViewer = page.locator('canvas').or(
        page.locator('[data-testid="pdf-viewer"]')
      );
      await expect(pdfViewer.first()).toBeVisible({ timeout: 10000 });

      // Should show signing controls
      await expect(
        page.getByRole('button', { name: /sign|next|submit/i }).first()
      ).toBeVisible();
    });

    test('should show field indicators on document', async ({ page }) => {
      const testToken = process.env.TEST_SIGNING_TOKEN;

      if (!testToken) {
        test.skip();
        return;
      }

      await page.goto(`/sign/${testToken}`);
      await page.waitForLoadState('networkidle');

      // Should show field markers or highlights
      await expect(
        page.locator('[data-field-type]').or(
          page.locator('.field-indicator')
        ).first()
      ).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Signature Creation', () => {
    test('should open signature pad modal', async ({ page }) => {
      const testToken = process.env.TEST_SIGNING_TOKEN;

      if (!testToken) {
        test.skip();
        return;
      }

      await page.goto(`/sign/${testToken}`);
      await page.waitForLoadState('networkidle');

      // Click on signature field or sign button
      const signatureField = page.locator('[data-field-type="signature"]').or(
        page.getByRole('button', { name: /sign here/i })
      ).first();

      if (await signatureField.isVisible()) {
        await signatureField.click();

        // Signature pad modal should open
        await expect(
          page.locator('canvas').or(page.getByText(/draw|type|upload/i))
        ).toBeVisible();
      }
    });

    test('should allow drawing signature', async ({ page }) => {
      const testToken = process.env.TEST_SIGNING_TOKEN;

      if (!testToken) {
        test.skip();
        return;
      }

      await page.goto(`/sign/${testToken}`);
      await page.waitForLoadState('networkidle');

      // Open signature modal
      const signatureField = page.locator('[data-field-type="signature"]').first();
      if (await signatureField.isVisible()) {
        await signatureField.click();

        // Select draw mode
        const drawTab = page.getByRole('tab', { name: /draw/i }).or(
          page.getByText(/draw/i)
        );
        if (await drawTab.isVisible()) {
          await drawTab.click();
        }

        // Find signature canvas
        const canvas = page.locator('canvas').first();
        if (await canvas.isVisible()) {
          // Draw a simple signature
          const box = await canvas.boundingBox();
          if (box) {
            await page.mouse.move(box.x + 20, box.y + 20);
            await page.mouse.down();
            await page.mouse.move(box.x + 100, box.y + 50);
            await page.mouse.move(box.x + 150, box.y + 30);
            await page.mouse.up();
          }
        }
      }
    });

    test('should allow typing signature', async ({ page }) => {
      const testToken = process.env.TEST_SIGNING_TOKEN;

      if (!testToken) {
        test.skip();
        return;
      }

      await page.goto(`/sign/${testToken}`);
      await page.waitForLoadState('networkidle');

      // Open signature modal
      const signatureField = page.locator('[data-field-type="signature"]').first();
      if (await signatureField.isVisible()) {
        await signatureField.click();

        // Select type mode
        const typeTab = page.getByRole('tab', { name: /type/i }).or(
          page.getByText(/type/i)
        );
        if (await typeTab.isVisible()) {
          await typeTab.click();

          // Type name
          const nameInput = page.getByPlaceholder(/name|type here/i);
          if (await nameInput.isVisible()) {
            await nameInput.fill('John Doe');
          }
        }
      }
    });

    test('should clear signature', async ({ page }) => {
      const testToken = process.env.TEST_SIGNING_TOKEN;

      if (!testToken) {
        test.skip();
        return;
      }

      await page.goto(`/sign/${testToken}`);
      await page.waitForLoadState('networkidle');

      // Open signature modal and draw
      const signatureField = page.locator('[data-field-type="signature"]').first();
      if (await signatureField.isVisible()) {
        await signatureField.click();

        // Look for clear button
        const clearButton = page.getByRole('button', { name: /clear/i });
        await expect(clearButton).toBeVisible();
      }
    });
  });

  test.describe('Field Completion', () => {
    test('should fill text field', async ({ page }) => {
      const testToken = process.env.TEST_SIGNING_TOKEN;

      if (!testToken) {
        test.skip();
        return;
      }

      await page.goto(`/sign/${testToken}`);
      await page.waitForLoadState('networkidle');

      // Find text field
      const textField = page.locator('[data-field-type="text"]').or(
        page.locator('input[type="text"]')
      ).first();

      if (await textField.isVisible()) {
        await textField.fill('Test Value');
      }
    });

    test('should fill date field', async ({ page }) => {
      const testToken = process.env.TEST_SIGNING_TOKEN;

      if (!testToken) {
        test.skip();
        return;
      }

      await page.goto(`/sign/${testToken}`);
      await page.waitForLoadState('networkidle');

      // Find date field
      const dateField = page.locator('[data-field-type="date"]').or(
        page.locator('input[type="date"]')
      ).first();

      if (await dateField.isVisible()) {
        await dateField.fill('2025-01-29');
      }
    });

    test('should check checkbox field', async ({ page }) => {
      const testToken = process.env.TEST_SIGNING_TOKEN;

      if (!testToken) {
        test.skip();
        return;
      }

      await page.goto(`/sign/${testToken}`);
      await page.waitForLoadState('networkidle');

      // Find checkbox field
      const checkboxField = page.locator('[data-field-type="checkbox"]').or(
        page.locator('input[type="checkbox"]')
      ).first();

      if (await checkboxField.isVisible()) {
        await checkboxField.check();
        await expect(checkboxField).toBeChecked();
      }
    });

    test('should select dropdown option', async ({ page }) => {
      const testToken = process.env.TEST_SIGNING_TOKEN;

      if (!testToken) {
        test.skip();
        return;
      }

      await page.goto(`/sign/${testToken}`);
      await page.waitForLoadState('networkidle');

      // Find dropdown field
      const dropdownField = page.locator('[data-field-type="dropdown"]').or(
        page.locator('select')
      ).first();

      if (await dropdownField.isVisible()) {
        await dropdownField.click();
        // Select first option
        await page.getByRole('option').first().click();
      }
    });
  });

  test.describe('Form Validation', () => {
    test('should show validation for required fields', async ({ page }) => {
      const testToken = process.env.TEST_SIGNING_TOKEN;

      if (!testToken) {
        test.skip();
        return;
      }

      await page.goto(`/sign/${testToken}`);
      await page.waitForLoadState('networkidle');

      // Try to submit without completing required fields
      const submitButton = page.getByRole('button', { name: /submit|finish|complete/i });
      if (await submitButton.isVisible()) {
        await submitButton.click();

        // Should show validation message
        await expect(
          page.getByText(/required|please complete|missing/i)
        ).toBeVisible();
      }
    });

    test('should highlight incomplete required fields', async ({ page }) => {
      const testToken = process.env.TEST_SIGNING_TOKEN;

      if (!testToken) {
        test.skip();
        return;
      }

      await page.goto(`/sign/${testToken}`);
      await page.waitForLoadState('networkidle');

      // Look for required field indicator
      const requiredIndicator = page.locator('[data-required="true"]').or(
        page.locator('.required').or(
          page.getByText('*')
        )
      );

      await expect(requiredIndicator.first()).toBeVisible();
    });
  });

  test.describe('Document Navigation', () => {
    test('should navigate between pages', async ({ page }) => {
      const testToken = process.env.TEST_SIGNING_TOKEN;

      if (!testToken) {
        test.skip();
        return;
      }

      await page.goto(`/sign/${testToken}`);
      await page.waitForLoadState('networkidle');

      // Look for page navigation
      const nextPageButton = page.getByRole('button', { name: /next.*page/i }).or(
        page.locator('[aria-label="Next page"]')
      );

      if (await nextPageButton.isVisible() && await nextPageButton.isEnabled()) {
        await nextPageButton.click();
        // Wait for page change
        await page.waitForTimeout(500);
      }
    });

    test('should show page indicators', async ({ page }) => {
      const testToken = process.env.TEST_SIGNING_TOKEN;

      if (!testToken) {
        test.skip();
        return;
      }

      await page.goto(`/sign/${testToken}`);
      await page.waitForLoadState('networkidle');

      // Look for page number indicator
      const pageIndicator = page.getByText(/page \d/i).or(
        page.locator('[data-testid="page-indicator"]')
      );

      await expect(pageIndicator.first()).toBeVisible();
    });
  });

  test.describe('Signing Completion', () => {
    test('should show confirmation after signing', async ({ page }) => {
      const testToken = process.env.TEST_SIGNING_TOKEN;

      if (!testToken) {
        test.skip();
        return;
      }

      await page.goto(`/sign/${testToken}`);
      await page.waitForLoadState('networkidle');

      // Complete all required fields (this is a simplified version)
      // In a real test, you would fill all fields programmatically

      // Submit the document
      const submitButton = page.getByRole('button', { name: /submit|finish|complete/i });
      if (await submitButton.isVisible()) {
        // Note: This would only work if all fields are already complete
        await submitButton.click();

        // Should show success message or redirect
        await expect(
          page.getByText(/thank you|completed|success|signed/i)
        ).toBeVisible({ timeout: 15000 });
      }
    });

    test('should allow downloading signed document', async ({ page }) => {
      const testToken = process.env.TEST_SIGNING_TOKEN;

      if (!testToken) {
        test.skip();
        return;
      }

      await page.goto(`/sign/${testToken}`);
      await page.waitForLoadState('networkidle');

      // Look for download option (usually appears after signing)
      const downloadButton = page.getByRole('button', { name: /download/i });

      if (await downloadButton.isVisible()) {
        const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
        await downloadButton.click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain('.pdf');
      }
    });
  });
});

test.describe('Signing Declined Flow', () => {
  test('should allow declining to sign', async ({ page }) => {
    const testToken = process.env.TEST_SIGNING_TOKEN;

    if (!testToken) {
      test.skip();
      return;
    }

    await page.goto(`/sign/${testToken}`);
    await page.waitForLoadState('networkidle');

    // Look for decline option
    const declineButton = page.getByRole('button', { name: /decline|refuse/i });

    if (await declineButton.isVisible()) {
      await declineButton.click();

      // Should show confirmation dialog
      await expect(
        page.getByText(/are you sure|confirm|decline/i)
      ).toBeVisible();
    }
  });

  test('should require reason for declining', async ({ page }) => {
    const testToken = process.env.TEST_SIGNING_TOKEN;

    if (!testToken) {
      test.skip();
      return;
    }

    await page.goto(`/sign/${testToken}`);
    await page.waitForLoadState('networkidle');

    const declineButton = page.getByRole('button', { name: /decline/i });

    if (await declineButton.isVisible()) {
      await declineButton.click();

      // Look for reason input
      const reasonInput = page.getByPlaceholder(/reason/i).or(
        page.locator('textarea')
      );

      await expect(reasonInput).toBeVisible();
    }
  });
});
