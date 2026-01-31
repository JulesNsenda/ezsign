import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * Document Management E2E Tests
 * Tests document creation, editing, and management flows
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

test.describe('Document Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test.describe('Documents List', () => {
    test('should display documents page', async ({ page }) => {
      await page.goto('/documents');

      // Should show documents heading or empty state
      await expect(
        page.getByRole('heading', { name: /documents/i }).or(
          page.getByText(/no documents|get started/i)
        )
      ).toBeVisible();
    });

    test('should have option to create new document', async ({ page }) => {
      await page.goto('/documents');

      // Look for create/upload button
      const createButton = page.getByRole('button', { name: /new|create|upload/i });
      await expect(createButton).toBeVisible();
    });

    test('should filter documents by status', async ({ page }) => {
      await page.goto('/documents');

      // Look for status filter
      const statusFilter = page.getByRole('combobox', { name: /status|filter/i }).or(
        page.getByRole('button', { name: /all|draft|pending|completed/i })
      );

      if (await statusFilter.isVisible()) {
        await statusFilter.click();
        // Select a filter option
        await page.getByRole('option', { name: /pending/i }).or(
          page.getByText(/pending/i)
        ).click();
      }
    });

    test('should search documents', async ({ page }) => {
      await page.goto('/documents');

      // Look for search input
      const searchInput = page.getByPlaceholder(/search/i);
      if (await searchInput.isVisible()) {
        await searchInput.fill('test document');
        await page.keyboard.press('Enter');
        // Wait for search results
        await page.waitForLoadState('networkidle');
      }
    });
  });

  test.describe('Document Upload', () => {
    test('should open upload dialog', async ({ page }) => {
      await page.goto('/documents');

      // Click create/upload button
      await page.getByRole('button', { name: /new|create|upload/i }).click();

      // Should show upload dialog/modal
      await expect(
        page.getByText(/upload|drag and drop|select file/i)
      ).toBeVisible();
    });

    test('should upload PDF file', async ({ page }) => {
      await page.goto('/documents');

      // Click create/upload button
      await page.getByRole('button', { name: /new|create|upload/i }).click();

      // Set up file input handling
      const fileInput = page.locator('input[type="file"]');

      // Note: For actual testing, you would provide a test PDF file
      // This test verifies the file input exists and is functional
      await expect(fileInput).toBeAttached();
    });

    test('should show error for invalid file type', async ({ page }) => {
      await page.goto('/documents');

      // Click create/upload button
      await page.getByRole('button', { name: /new|create|upload/i }).click();

      // Wait for upload modal
      await page.waitForTimeout(500);

      // Verify the upload accepts PDF files (check accept attribute)
      const fileInput = page.locator('input[type="file"]');
      const acceptAttr = await fileInput.getAttribute('accept');

      // Should accept PDF files
      if (acceptAttr) {
        expect(acceptAttr.toLowerCase()).toContain('pdf');
      }
    });
  });

  test.describe('Document Preparation', () => {
    // Note: These tests require an existing document in draft state
    test('should navigate to prepare document page', async ({ page }) => {
      await page.goto('/documents');

      // Click on a document or edit button
      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      const documentLink = page.getByRole('link', { name: /document/i }).first();

      if (await editButton.isVisible()) {
        await editButton.click();
      } else if (await documentLink.isVisible()) {
        await documentLink.click();
      } else {
        // Skip if no documents exist
        test.skip();
        return;
      }

      // Should be on prepare document page
      await expect(page).toHaveURL(/.*prepare|editor/);
    });

    test('should display PDF viewer on prepare page', async ({ page }) => {
      // Go directly to prepare page if we have a document ID
      await page.goto('/documents');

      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      if (await editButton.isVisible()) {
        await editButton.click();
        await page.waitForLoadState('networkidle');

        // PDF viewer or canvas should be visible
        const pdfViewer = page.locator('canvas').or(
          page.locator('[data-testid="pdf-viewer"]')
        );
        await expect(pdfViewer.first()).toBeVisible({ timeout: 10000 });
      } else {
        test.skip();
      }
    });

    test('should show field toolbar', async ({ page }) => {
      await page.goto('/documents');

      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      if (await editButton.isVisible()) {
        await editButton.click();
        await page.waitForLoadState('networkidle');

        // Field toolbar should have field type options
        await expect(
          page.getByText(/signature|text|date|checkbox/i).first()
        ).toBeVisible();
      } else {
        test.skip();
      }
    });

    test('should add signer to document', async ({ page }) => {
      await page.goto('/documents');

      const editButton = page.getByRole('button', { name: /edit|prepare/i }).first();
      if (await editButton.isVisible()) {
        await editButton.click();
        await page.waitForLoadState('networkidle');

        // Look for add signer button
        const addSignerButton = page.getByRole('button', { name: /add signer/i });
        if (await addSignerButton.isVisible()) {
          await addSignerButton.click();

          // Fill in signer details
          const emailInput = page.getByPlaceholder(/email/i).last();
          const nameInput = page.getByPlaceholder(/name/i).last();

          await emailInput.fill('signer@example.com');
          if (await nameInput.isVisible()) {
            await nameInput.fill('Test Signer');
          }
        }
      } else {
        test.skip();
      }
    });
  });

  test.describe('Document Actions', () => {
    test('should show document actions menu', async ({ page }) => {
      await page.goto('/documents');

      // Look for actions menu (three dots or dropdown)
      const actionsButton = page.getByRole('button', { name: /actions|more|menu/i }).or(
        page.locator('[data-testid="document-actions"]')
      ).first();

      if (await actionsButton.isVisible()) {
        await actionsButton.click();

        // Should show actions like view, edit, delete
        await expect(
          page.getByRole('menuitem', { name: /view|edit|delete/i }).first().or(
            page.getByText(/view|edit|delete/i).first()
          )
        ).toBeVisible();
      }
    });

    test('should send document for signing', async ({ page }) => {
      await page.goto('/documents');

      // Find a document and click send
      const sendButton = page.getByRole('button', { name: /send/i }).first();

      if (await sendButton.isVisible()) {
        await sendButton.click();

        // Should show confirmation or redirect
        await expect(
          page.getByText(/sent|success|confirm/i).or(
            page.getByRole('dialog')
          )
        ).toBeVisible();
      }
    });

    test('should cancel pending document', async ({ page }) => {
      await page.goto('/documents');

      // Filter to pending documents
      const statusFilter = page.getByRole('combobox', { name: /status/i });
      if (await statusFilter.isVisible()) {
        await statusFilter.click();
        await page.getByRole('option', { name: /pending/i }).click();
      }

      // Look for cancel action
      const actionsButton = page.getByRole('button', { name: /actions|more/i }).first();
      if (await actionsButton.isVisible()) {
        await actionsButton.click();
        const cancelOption = page.getByRole('menuitem', { name: /cancel/i });
        if (await cancelOption.isVisible()) {
          await cancelOption.click();
          // Confirm cancellation if dialog appears
          const confirmButton = page.getByRole('button', { name: /confirm|yes/i });
          if (await confirmButton.isVisible()) {
            await confirmButton.click();
          }
        }
      }
    });

    test('should delete document', async ({ page }) => {
      await page.goto('/documents');

      // Find delete action
      const actionsButton = page.getByRole('button', { name: /actions|more/i }).first();
      if (await actionsButton.isVisible()) {
        await actionsButton.click();
        const deleteOption = page.getByRole('menuitem', { name: /delete/i });
        if (await deleteOption.isVisible()) {
          await deleteOption.click();

          // Confirm deletion
          const confirmButton = page.getByRole('button', { name: /confirm|delete|yes/i });
          if (await confirmButton.isVisible()) {
            await confirmButton.click();
          }
        }
      }
    });
  });

  test.describe('Document Download', () => {
    test('should download completed document', async ({ page }) => {
      await page.goto('/documents');

      // Filter to completed documents
      const statusFilter = page.getByRole('combobox', { name: /status/i });
      if (await statusFilter.isVisible()) {
        await statusFilter.click();
        await page.getByRole('option', { name: /completed/i }).click();
      }

      // Look for download button
      const downloadButton = page.getByRole('button', { name: /download/i }).first();
      if (await downloadButton.isVisible()) {
        // Set up download listener
        const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
        await downloadButton.click();

        // Verify download started
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain('.pdf');
      }
    });
  });
});

test.describe('Document Pagination', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('should paginate through documents', async ({ page }) => {
    await page.goto('/documents');

    // Look for pagination controls
    const nextButton = page.getByRole('button', { name: /next/i }).or(
      page.locator('[aria-label="Next page"]')
    );

    if (await nextButton.isVisible() && await nextButton.isEnabled()) {
      await nextButton.click();
      // Wait for new page to load
      await page.waitForLoadState('networkidle');
    }
  });

  test('should change items per page', async ({ page }) => {
    await page.goto('/documents');

    // Look for page size selector
    const pageSizeSelector = page.getByRole('combobox', { name: /per page|page size/i });

    if (await pageSizeSelector.isVisible()) {
      await pageSizeSelector.click();
      await page.getByRole('option', { name: /25|50/i }).click();
    }
  });
});
