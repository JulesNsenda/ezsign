import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Sign from './Sign';
import { useSigningSession, useSubmitSignatures } from '@/hooks/useSignature';
import { usePublicBranding } from '@/hooks/useBranding';
import { useToast } from '@/hooks/useToast';
import type { Field, Signer } from '@/types';

/**
 * Covers the signing-page error-envelope mismatch (registration-gate plan,
 * item 4/J1-J3):
 *  - J1: submit failures where the backend sends `{success:false, error:
 *    '<string>'}` (signingController's shape) must surface the real message,
 *    not the generic fallback a bare `.error?.message` read used to produce.
 *  - J2: the "invalid link" card must show the server's specific reason
 *    (deadline passed, out of turn, etc.) when the session fetch fails with
 *    one, falling back to the generic copy only when it doesn't.
 *  - J3: the textarea field's effective maxLength must never exceed the
 *    `varchar(500)` column it's persisted to, regardless of the field's
 *    configured `properties.maxLength`.
 */

vi.mock('@/hooks/useSignature', () => ({
  useSigningSession: vi.fn(),
  useSubmitSignatures: vi.fn(),
}));

vi.mock('@/hooks/useBranding', () => ({
  usePublicBranding: vi.fn(),
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: vi.fn(),
}));

vi.mock('@/components/PdfViewer', () => ({
  default: ({ children }: any) => (
    <div data-testid="pdf-viewer">{typeof children === 'function' ? children(1) : children}</div>
  ),
}));

const mockUseSigningSession = useSigningSession as unknown as ReturnType<typeof vi.fn>;
const mockUseSubmitSignatures = useSubmitSignatures as unknown as ReturnType<typeof vi.fn>;
const mockUsePublicBranding = usePublicBranding as unknown as ReturnType<typeof vi.fn>;
const mockUseToast = useToast as unknown as ReturnType<typeof vi.fn>;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const baseSigner: Signer = {
  id: 'signer-1',
  document_id: 'doc-1',
  email: 'signer@example.com',
  name: 'Test Signer',
  status: 'pending',
  access_token: 'test-token',
  created_at: '2026-01-01T00:00:00Z',
};

const textareaField: Field = {
  id: 'field-1',
  document_id: 'doc-1',
  type: 'textarea',
  page: 0,
  x: 0,
  y: 0,
  width: 200,
  height: 60,
  required: false,
  properties: { maxLength: 1000 },
  created_at: '2026-01-01T00:00:00Z',
};

function buildSession(fields: Field[] = [textareaField]) {
  return {
    document: { id: 'doc-1', title: 'Test Document', page_count: 1, team_id: null },
    signer: baseSigner,
    fields,
    signatures: [],
  };
}

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/sign/:token" element={<Sign />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('Sign page - error envelope + textarea clamp (item 4/J1-J3)', () => {
  const toastError = vi.fn();
  const toastWarning = vi.fn();
  const submitMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseToast.mockReturnValue({
      success: vi.fn(),
      error: toastError,
      warning: toastWarning,
      info: vi.fn(),
    });
    mockUsePublicBranding.mockReturnValue({ data: undefined });
    mockUseSubmitSignatures.mockReturnValue({
      mutateAsync: submitMutateAsync,
      isPending: false,
    });
  });

  describe('J1 - submit error envelope', () => {
    beforeEach(() => {
      mockUseSigningSession.mockReturnValue({
        data: buildSession(),
        isLoading: false,
        error: null,
      });
    });

    const fillAndSubmit = async () => {
      renderAt('/sign/test-token');
      fireEvent.click(screen.getByRole('button', { name: 'Sign This Field' }));
      // Modal.tsx's backdrop wrapper carries `aria-hidden="true"` around the
      // whole dialog (a pre-existing Modal.tsx quirk, out of this slice's
      // scope) - `hidden: true` is needed for role queries to see inside it.
      fireEvent.change(screen.getByRole('textbox', { hidden: true }), {
        target: { value: 'hello world' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Text', hidden: true }));

      const submitButton = await screen.findByRole('button', { name: 'Complete Signing' });
      await waitFor(() => expect(submitButton).not.toBeDisabled());
      fireEvent.click(submitButton);
    };

    it("surfaces signingController's plain-string `error` field instead of the generic fallback", async () => {
      submitMutateAsync.mockRejectedValue({
        response: { data: { success: false, error: 'It is not your turn to sign yet (sequential workflow)' } },
      });

      await fillAndSubmit();

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith('It is not your turn to sign yet (sequential workflow)'),
      );
      expect(toastError).not.toHaveBeenCalledWith('Failed to submit signatures');
    });

    it('still handles the nested `{error: {message}}` envelope (errorHandler.ts shape)', async () => {
      submitMutateAsync.mockRejectedValue({
        response: { data: { error: { code: 'VALIDATION_ERROR', message: 'One or more fields do not belong to this signer' } } },
      });

      await fillAndSubmit();

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith('One or more fields do not belong to this signer'),
      );
    });

    it('falls back to the generic message when the response carries no usable text', async () => {
      submitMutateAsync.mockRejectedValue(new Error('network down'));

      await fillAndSubmit();

      await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to submit signatures'));
    });
  });

  describe('J2 - load-error card', () => {
    it("shows the server's specific reason when the session fetch fails with one", () => {
      mockUseSigningSession.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: {
          response: {
            data: { success: false, error: 'This document has been cancelled and can no longer be signed.' },
          },
        },
      });

      renderAt('/sign/test-token');

      expect(screen.getByRole('heading', { name: 'Invalid or Expired Link' })).toBeInTheDocument();
      expect(
        screen.getByText('This document has been cancelled and can no longer be signed.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('This signing link is no longer valid. Please contact the document sender for a new link.'),
      ).not.toBeInTheDocument();
    });

    it('falls back to the generic copy when the error carries no usable message', () => {
      mockUseSigningSession.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Network Error'),
      });

      renderAt('/sign/test-token');

      expect(
        screen.getByText('This signing link is no longer valid. Please contact the document sender for a new link.'),
      ).toBeInTheDocument();
    });

    it('falls back to the generic copy when there is no session and no error object at all', () => {
      mockUseSigningSession.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
      });

      renderAt('/sign/test-token');

      expect(
        screen.getByText('This signing link is no longer valid. Please contact the document sender for a new link.'),
      ).toBeInTheDocument();
    });
  });

  describe('J3 - textarea maxLength clamp', () => {
    it('clamps the effective maxLength to 500 even when the field requests 1000', async () => {
      mockUseSigningSession.mockReturnValue({
        data: buildSession([{ ...textareaField, properties: { maxLength: 1000 } }]),
        isLoading: false,
        error: null,
      });

      renderAt('/sign/test-token');
      fireEvent.click(screen.getByRole('button', { name: 'Sign This Field' }));

      const textarea = screen.getByRole('textbox', { hidden: true });
      // A 600-char submission must not survive past the varchar(500) cap -
      // the component clamps by slicing in its onChange handler, so the
      // remaining-count affordance is the observable proof.
      fireEvent.change(textarea, { target: { value: 'a'.repeat(600) } });

      expect(screen.getByText('0 characters remaining')).toBeInTheDocument();
    });

    it('respects a field-configured maxLength lower than 500', async () => {
      mockUseSigningSession.mockReturnValue({
        data: buildSession([{ ...textareaField, properties: { maxLength: 200 } }]),
        isLoading: false,
        error: null,
      });

      renderAt('/sign/test-token');
      fireEvent.click(screen.getByRole('button', { name: 'Sign This Field' }));

      const textarea = screen.getByRole('textbox', { hidden: true });
      fireEvent.change(textarea, { target: { value: 'a'.repeat(250) } });

      expect(screen.getByText('0 characters remaining')).toBeInTheDocument();
    });
  });
});
