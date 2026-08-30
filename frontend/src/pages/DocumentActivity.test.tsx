import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import DocumentActivity from './DocumentActivity';
import activityService, { type ActivityItem } from '@/services/activityService';
import signerService from '@/services/signerService';

vi.mock('@/services/activityService', () => ({
  default: { getDocumentActivity: vi.fn() },
  activityService: { getDocumentActivity: vi.fn() },
}));

vi.mock('@/services/signerService', () => ({
  default: { resend: vi.fn() },
}));

const mockToast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
vi.mock('@/hooks/useToast', () => ({
  useToast: () => mockToast,
  default: () => mockToast,
}));

vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function makeItem(overrides: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: 'row-1',
    kind: 'email',
    createdAt: '2026-08-01T10:00:00.000Z',
    type: 'signing_request',
    status: 'sent',
    errorMessage: null,
    subject: 'Please sign',
    recipientEmail: 'signer@example.com',
    actorEmail: 'owner@example.com',
    signerId: 'signer-1',
    signerEmail: 'signer@example.com',
    signerName: 'Signer One',
    metadata: null,
    ...overrides,
  };
}

function respondWith(items: ActivityItem[], canResend = true) {
  (activityService.getDocumentActivity as ReturnType<typeof vi.fn>).mockResolvedValue({
    items,
    pagination: { total: items.length, page: 1, limit: 20, total_pages: 1 },
    permissions: { canResend },
  });
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/documents/doc-1/activity']}>
        <Routes>
          <Route path="/documents/:id/activity" element={<DocumentActivity />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DocumentActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the failure reason on a failed email, which is the point of the screen', async () => {
    respondWith([
      makeItem({
        status: 'failed',
        errorMessage: 'Mailbox does not exist',
      }),
    ]);

    renderPage();

    expect(await screen.findByTestId('activity-error')).toHaveTextContent(
      'Mailbox does not exist'
    );
    expect(screen.getByTestId('activity-row-failed')).toBeInTheDocument();
  });

  it('offers Resend on a failed row and refreshes after a successful resend', async () => {
    respondWith([makeItem({ status: 'failed', errorMessage: 'Mailbox does not exist' })]);
    (signerService.resend as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    renderPage();

    const button = await screen.findByRole('button', { name: /resend/i });
    await userEvent.click(button);

    await waitFor(() => {
      expect(signerService.resend).toHaveBeenCalledWith('doc-1', 'signer-1');
    });
    expect(mockToast.success).toHaveBeenCalled();
  });

  it('surfaces the reminder-limit reason rather than a generic failure', async () => {
    // The resend endpoint answers 429 with a reason. "You have already sent
    // the maximum number of reminders" is a different problem from "the
    // address bounced", and telling them apart is what this screen is for.
    respondWith([makeItem({ status: 'failed', errorMessage: 'Mailbox does not exist' })]);
    (signerService.resend as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { message: 'Maximum reminders already sent for this signer' } },
    });

    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /resend/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        'Maximum reminders already sent for this signer'
      );
    });
  });

  it('does not offer Resend on a successful email', async () => {
    respondWith([makeItem({ status: 'sent' })]);

    renderPage();

    await screen.findByText(/signing request email/i);
    expect(screen.queryByRole('button', { name: /resend/i })).not.toBeInTheDocument();
  });

  it('does not offer Resend when the signer did not resolve', async () => {
    // The resend endpoint is addressed by signer id; a row whose signer join
    // returned null has nothing to resend to.
    respondWith([
      makeItem({ status: 'failed', errorMessage: 'Mailbox does not exist', signerId: null }),
    ]);

    renderPage();

    await screen.findByTestId('activity-row-failed');
    expect(screen.queryByRole('button', { name: /resend/i })).not.toBeInTheDocument();
  });

  it('does not offer Resend to an instance admin, and says why', async () => {
    // `/activity` has an admin bypass; the resend endpoint does not. Rendering
    // the button would 403 for exactly the user the bypass exists to help.
    respondWith(
      [makeItem({ status: 'failed', errorMessage: 'Mailbox does not exist' })],
      /* canResend */ false
    );

    renderPage();

    await screen.findByTestId('activity-row-failed');
    expect(screen.queryByRole('button', { name: /resend/i })).not.toBeInTheDocument();
    expect(screen.getByText(/instance administrator/i)).toBeInTheDocument();
  });

  it('labels an empty timeline as unrecorded rather than as nothing having happened', async () => {
    // A cascading delete erases a document's history, so an empty response is
    // indistinguishable from a deleted document.
    respondWith([]);

    renderPage();

    expect(await screen.findByText(/no recorded activity/i)).toBeInTheDocument();
  });

  it('does not present a viewed event as attested', async () => {
    // Mail-security scanners fetch every link and burn the once-per-signer
    // gate, so the first open may not be the signer at all.
    respondWith([makeItem({ kind: 'audit', type: 'viewed', status: null, subject: null })]);

    renderPage();

    expect(await screen.findByText(/link scanners/i)).toBeInTheDocument();
  });

  it('states that the timeline is best-effort', async () => {
    respondWith([makeItem()]);

    renderPage();

    expect(await screen.findByText(/not a legal attestation/i)).toBeInTheDocument();
  });

  it('can filter down to failures only', async () => {
    respondWith([
      makeItem({ id: 'ok', status: 'sent' }),
      makeItem({ id: 'bad', status: 'failed', errorMessage: 'Mailbox does not exist' }),
    ]);

    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /show only failures/i }));

    await waitFor(() => {
      expect(screen.queryAllByTestId('activity-row')).toHaveLength(0);
    });
    expect(screen.getAllByTestId('activity-row-failed')).toHaveLength(1);
  });

  it('falls back to the raw type when a label is missing', async () => {
    // Better than "Unknown event": it keeps the information and makes the
    // missing label visible instead of hiding it.
    respondWith([makeItem({ kind: 'audit', type: 'some_new_verb', status: null })]);

    renderPage();

    expect(await screen.findByText('some_new_verb')).toBeInTheDocument();
  });
});
