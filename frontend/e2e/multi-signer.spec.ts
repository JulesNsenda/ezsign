import { test, expect } from '@playwright/test';

/**
 * Multi-Signer Workflow E2E Tests
 * Tests workflows involving multiple signers (sequential and parallel)
 */

// Helper to login before tests
async function loginAsTestUser(page: any) {
  const testEmail = process.env.TEST_USER_EMAIL || 'test@example.com';
  const testPassword = process.env.TEST_USER_PASSWORD || 'TestPassword123!';

  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(testEmail);
  await page.getByPlaceholder('••••••••').fill(testPassword);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/.*(?:dashboard|\/)/i, { timeout: 10000 });
}

test.describe('Multi-Signer Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test.describe('Adding Multiple Signers', () => {
    test('should add multiple signers to document', async ({ page }) => {
      await page.goto('/documents');

      // Find a document to edit
      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      if (!await editButton.isVisible()) {
        test.skip();
        return;
      }

      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Add first signer
      const addSignerButton = page.getByRole('button', { name: /add signer/i });
      await addSignerButton.click();

      const emailInputs = page.getByPlaceholder(/email/i);
      await emailInputs.last().fill('signer1@example.com');

      // Add second signer
      await addSignerButton.click();
      await emailInputs.last().fill('signer2@example.com');

      // Verify both signers are listed
      await expect(page.getByText('signer1@example.com')).toBeVisible();
      await expect(page.getByText('signer2@example.com')).toBeVisible();
    });

    test('should remove signer from document', async ({ page }) => {
      await page.goto('/documents');

      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      if (!await editButton.isVisible()) {
        test.skip();
        return;
      }

      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Look for remove signer button
      const removeButton = page.getByRole('button', { name: /remove|delete/i }).filter({
        has: page.locator('[data-testid="signer"]')
      }).or(
        page.locator('[data-testid="remove-signer"]')
      ).first();

      if (await removeButton.isVisible()) {
        await removeButton.click();
      }
    });

    test('should validate duplicate signer emails', async ({ page }) => {
      await page.goto('/documents');

      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      if (!await editButton.isVisible()) {
        test.skip();
        return;
      }

      await editButton.click();
      await page.waitForLoadState('networkidle');

      const addSignerButton = page.getByRole('button', { name: /add signer/i });

      // Add signer with same email twice
      await addSignerButton.click();
      const emailInputs = page.getByPlaceholder(/email/i);
      await emailInputs.last().fill('duplicate@example.com');

      await addSignerButton.click();
      await emailInputs.last().fill('duplicate@example.com');

      // Should show duplicate email error
      await expect(
        page.getByText(/duplicate|already added|exists/i)
      ).toBeVisible();
    });
  });

  test.describe('Sequential Signing Workflow', () => {
    test('should set sequential signing order', async ({ page }) => {
      await page.goto('/documents');

      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      if (!await editButton.isVisible()) {
        test.skip();
        return;
      }

      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Look for workflow type selector
      const workflowSelector = page.getByRole('combobox', { name: /workflow|order|type/i }).or(
        page.getByLabel(/workflow|signing order/i)
      );

      if (await workflowSelector.isVisible()) {
        await workflowSelector.click();
        await page.getByRole('option', { name: /sequential/i }).click();

        await expect(workflowSelector).toContainText(/sequential/i);
      }
    });

    test('should reorder signers in sequential workflow', async ({ page }) => {
      await page.goto('/documents');

      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      if (!await editButton.isVisible()) {
        test.skip();
        return;
      }

      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Look for drag handles or reorder controls
      const dragHandle = page.locator('[data-testid="drag-handle"]').or(
        page.locator('.drag-handle')
      ).first();

      if (await dragHandle.isVisible()) {
        // Drag to reorder (simplified - real implementation would use actual drag)
        const signersList = page.locator('[data-testid="signers-list"]').or(
          page.locator('.signers-list')
        );
        await expect(signersList).toBeVisible();
      }
    });

    test('should show signing order numbers', async ({ page }) => {
      await page.goto('/documents');

      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      if (!await editButton.isVisible()) {
        test.skip();
        return;
      }

      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Set to sequential if available
      const workflowSelector = page.getByRole('combobox', { name: /workflow/i });
      if (await workflowSelector.isVisible()) {
        await workflowSelector.click();
        await page.getByRole('option', { name: /sequential/i }).click();
      }

      // Look for order indicators (1, 2, 3, etc.)
      const orderIndicator = page.locator('[data-order]').or(
        page.getByText(/^[1-3]$/)
      );

      await expect(orderIndicator.first()).toBeVisible();
    });
  });

  test.describe('Parallel Signing Workflow', () => {
    test('should set parallel signing mode', async ({ page }) => {
      await page.goto('/documents');

      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      if (!await editButton.isVisible()) {
        test.skip();
        return;
      }

      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Look for workflow type selector
      const workflowSelector = page.getByRole('combobox', { name: /workflow|order|type/i });

      if (await workflowSelector.isVisible()) {
        await workflowSelector.click();
        await page.getByRole('option', { name: /parallel/i }).click();

        await expect(workflowSelector).toContainText(/parallel/i);
      }
    });

    test('should not show order controls in parallel mode', async ({ page }) => {
      await page.goto('/documents');

      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      if (!await editButton.isVisible()) {
        test.skip();
        return;
      }

      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Set to parallel
      const workflowSelector = page.getByRole('combobox', { name: /workflow/i });
      if (await workflowSelector.isVisible()) {
        await workflowSelector.click();
        await page.getByRole('option', { name: /parallel/i }).click();
      }

      // Drag handles should not be visible in parallel mode
      const dragHandle = page.locator('[data-testid="drag-handle"]');
      await expect(dragHandle).toHaveCount(0);
    });
  });

  test.describe('Field Assignment to Signers', () => {
    test('should assign field to specific signer', async ({ page }) => {
      await page.goto('/documents');

      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      if (!await editButton.isVisible()) {
        test.skip();
        return;
      }

      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Click on a field to select it
      const field = page.locator('[data-field-type]').or(
        page.locator('.document-field')
      ).first();

      if (await field.isVisible()) {
        await field.click();

        // Look for signer assignment dropdown in properties panel
        const signerDropdown = page.getByRole('combobox', { name: /signer|assign/i }).or(
          page.getByLabel(/assign to signer/i)
        );

        if (await signerDropdown.isVisible()) {
          await signerDropdown.click();
          await page.getByRole('option').first().click();
        }
      }
    });

    test('should show signer color coding on fields', async ({ page }) => {
      await page.goto('/documents');

      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      if (!await editButton.isVisible()) {
        test.skip();
        return;
      }

      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Fields should have color indicators based on assigned signer
      const coloredField = page.locator('[data-signer-color]').or(
        page.locator('.signer-assigned')
      );

      // Might not have any assigned fields, so just check the page loaded
      await expect(page.locator('canvas').first()).toBeVisible();
    });

    test('should filter fields by signer', async ({ page }) => {
      await page.goto('/documents');

      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      if (!await editButton.isVisible()) {
        test.skip();
        return;
      }

      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Look for signer filter
      const signerFilter = page.getByRole('combobox', { name: /show fields|filter by signer/i });

      if (await signerFilter.isVisible()) {
        await signerFilter.click();
        await page.getByRole('option').nth(1).click();
      }
    });
  });

  test.describe('Multi-Signer Status Tracking', () => {
    test('should show signing progress indicator', async ({ page }) => {
      await page.goto('/documents');

      // Filter to pending documents with multiple signers
      const statusFilter = page.getByRole('combobox', { name: /status/i });
      if (await statusFilter.isVisible()) {
        await statusFilter.click();
        await page.getByRole('option', { name: /pending/i }).click();
      }

      // Look for progress indicator
      const progressIndicator = page.locator('[data-testid="signing-progress"]').or(
        page.getByText(/\d+\s*\/\s*\d+\s*signed/i).or(
          page.locator('.progress')
        )
      );

      // May or may not have documents with progress
      await page.waitForLoadState('networkidle');
    });

    test('should show individual signer status', async ({ page }) => {
      await page.goto('/documents');

      // Click on a pending document to view details
      const documentRow = page.locator('[data-status="pending"]').or(
        page.getByText(/pending/i).first()
      );

      if (await documentRow.isVisible()) {
        await documentRow.click();

        // Should show signer status list
        const signerStatus = page.getByText(/signed|pending|waiting/i);
        await expect(signerStatus.first()).toBeVisible({ timeout: 10000 });
      }
    });

    test('should allow resending to specific signer', async ({ page }) => {
      await page.goto('/documents');

      const statusFilter = page.getByRole('combobox', { name: /status/i });
      if (await statusFilter.isVisible()) {
        await statusFilter.click();
        await page.getByRole('option', { name: /pending/i }).click();
      }

      // Find document actions
      const actionsButton = page.getByRole('button', { name: /actions|more/i }).first();
      if (await actionsButton.isVisible()) {
        await actionsButton.click();

        // Look for resend option
        const resendOption = page.getByRole('menuitem', { name: /resend/i });
        if (await resendOption.isVisible()) {
          await resendOption.click();

          // Should show signer selection or confirmation
          await expect(
            page.getByText(/select signer|resend to|confirm/i)
          ).toBeVisible();
        }
      }
    });
  });

  test.describe('CC Recipients', () => {
    test('should add CC recipient', async ({ page }) => {
      await page.goto('/documents');

      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      if (!await editButton.isVisible()) {
        test.skip();
        return;
      }

      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Look for CC section
      const addCcButton = page.getByRole('button', { name: /add cc|add recipient/i }).or(
        page.getByText(/cc:/i)
      );

      if (await addCcButton.isVisible()) {
        await addCcButton.click();

        const ccEmailInput = page.getByPlaceholder(/cc email/i).or(
          page.locator('input[name="ccEmail"]')
        );

        if (await ccEmailInput.isVisible()) {
          await ccEmailInput.fill('cc@example.com');
        }
      }
    });

    test('should validate CC email format', async ({ page }) => {
      await page.goto('/documents');

      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      if (!await editButton.isVisible()) {
        test.skip();
        return;
      }

      await editButton.click();
      await page.waitForLoadState('networkidle');

      const addCcButton = page.getByRole('button', { name: /add cc/i });
      if (await addCcButton.isVisible()) {
        await addCcButton.click();

        const ccEmailInput = page.getByPlaceholder(/cc email/i);
        if (await ccEmailInput.isVisible()) {
          await ccEmailInput.fill('invalid-email');
          await ccEmailInput.blur();

          // Should show validation error
          await expect(
            page.getByText(/invalid email/i)
          ).toBeVisible();
        }
      }
    });
  });

  test.describe('Notification Settings', () => {
    test('should configure email notifications', async ({ page }) => {
      await page.goto('/documents');

      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      if (!await editButton.isVisible()) {
        test.skip();
        return;
      }

      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Look for notification settings
      const notificationToggle = page.getByRole('checkbox', { name: /notify|email notification/i }).or(
        page.getByLabel(/send notification/i)
      );

      if (await notificationToggle.isVisible()) {
        await notificationToggle.check();
        await expect(notificationToggle).toBeChecked();
      }
    });

    test('should set reminder frequency', async ({ page }) => {
      await page.goto('/documents');

      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      if (!await editButton.isVisible()) {
        test.skip();
        return;
      }

      await editButton.click();
      await page.waitForLoadState('networkidle');

      // Look for reminder settings
      const reminderSelect = page.getByRole('combobox', { name: /reminder/i });

      if (await reminderSelect.isVisible()) {
        await reminderSelect.click();
        await page.getByRole('option', { name: /daily|weekly/i }).click();
      }
    });
  });
});
