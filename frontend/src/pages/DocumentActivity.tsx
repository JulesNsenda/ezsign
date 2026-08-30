import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import { useDocumentActivity } from '@/hooks/useDocumentActivity';
import { useResendToSigner } from '@/hooks/useSigners';
import { useDocument } from '@/hooks/useDocuments';
import { useToast } from '@/hooks/useToast';
import type { ActivityItem } from '@/services/activityService';

/**
 * Document activity timeline.
 *
 * Answers the question this feature exists for: "an email for signature
 * failed and there is nowhere to see why." Lifecycle events and email
 * attempts are shown as one stream, failures are given the most weight, and
 * a failed row carries the action that fixes it.
 *
 * Replaces the never-routed `AuditTrail.tsx`, which called an endpoint that
 * does not exist, expected a different response shape, and keyed its icons on
 * event names the backend has never emitted.
 */

const PAGE_SIZE = 20;

/**
 * Pulls a human message out of an API error.
 *
 * This backend emits two envelopes: `errorHandler` produces
 * `{ error: { message } }`, while several controllers answer with a flat
 * `{ error }` or `{ message }`. Without covering both, a 403 on someone
 * else's document surfaces axios's "Request failed with status code 403"
 * instead of the reason the server actually gave.
 */
function extractApiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: unknown } })?.response?.data as
    | { message?: string; error?: string | { message?: string } }
    | undefined;
  if (data && typeof data.error === 'object' && data.error?.message) return data.error.message;
  if (typeof data?.error === 'string') return data.error;
  if (data?.message) return data.message;
  return (err as Error)?.message || fallback;
}

/** Email statuses that represent a delivery failure worth acting on. */
const FAILED_STATUSES = new Set(['failed', 'bounced']);

function isFailure(item: ActivityItem): boolean {
  return item.kind === 'email' && !!item.status && FAILED_STATUSES.has(item.status);
}

/** Only these email types represent a signing invitation worth resending. */
const RESENDABLE_EMAIL_TYPES = new Set(['signing_request', 'reminder']);

/**
 * Whether to offer Resend on a row.
 *
 * `canResend` from the API answers only "does this caller have the document
 * access the endpoint requires" - it is not a claim about any particular row.
 * The endpoint additionally requires a pending document, a pending signer,
 * the signer's turn in a sequential workflow, and reminder headroom, and it
 * reports its own reason when those fail. The checks here remove the cases
 * knowable from what this page already has, so the button is not offered
 * where it certainly cannot work:
 *
 * - a row whose signer did not resolve has no address for an endpoint keyed
 *   by signer id;
 * - a document that has completed or been cancelled can never be resent.
 */
function canResendItem(
  item: ActivityItem,
  canResend: boolean,
  documentStatus: string | undefined
): boolean {
  if (!canResend || !isFailure(item) || !item.signerId) return false;
  if (!RESENDABLE_EMAIL_TYPES.has(item.type)) return false;
  return documentStatus !== 'completed' && documentStatus !== 'cancelled';
}

const EVENT_LABELS: Record<string, string> = {
  created: 'Document created',
  updated: 'Document updated',
  sent: 'Sent for signature',
  viewed: 'Opened by signer',
  signed: 'Signed',
  declined: 'Declined',
  completed: 'Completed',
  cancelled: 'Cancelled',
  deleted: 'Deleted',
  // `downloaded` is intentionally absent: nothing emits it, because both
  // download routes double as the PDF viewer source. Do not add a label for a
  // verb with no writer - it implies the timeline can answer a question it
  // cannot.
  signer_reminder_sent: 'Reminder sent',
  'admin.activity_viewed': 'Activity viewed by an instance admin',
};

const EMAIL_LABELS: Record<string, string> = {
  signing_request: 'Signing request email',
  reminder: 'Reminder email',
  completion: 'Completion email',
  welcome: 'Welcome email',
  verification: 'Email verification',
  password_reset: 'Password reset email',
  password_change: 'Password change notice',
};

function labelFor(item: ActivityItem): string {
  const map = item.kind === 'audit' ? EVENT_LABELS : EMAIL_LABELS;
  // Fall back to the raw type rather than "Unknown event": a value we have no
  // label for is still more informative than none, and it makes a missing
  // label visible instead of hiding it.
  return map[item.type] ?? item.type;
}

function iconFor(item: ActivityItem): string {
  if (isFailure(item)) return '⚠️';
  if (item.kind === 'email') return '✉️';
  const icons: Record<string, string> = {
    created: '📄',
    sent: '📤',
    viewed: '👁️',
    signed: '✍️',
    completed: '✅',
    cancelled: '❌',
    declined: '🚫',
    signer_reminder_sent: '🔔',
    'admin.activity_viewed': '🔍',
  };
  return icons[item.type] ?? '📌';
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Who the row is about, in the order a support reader would want it. */
function subjectOf(item: ActivityItem): string | null {
  if (item.signerName && item.signerEmail) return `${item.signerName} (${item.signerEmail})`;
  return item.signerEmail ?? item.recipientEmail ?? item.actorEmail;
}

export const DocumentActivity: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [showFailuresOnly, setShowFailuresOnly] = useState(false);

  const { data, isLoading, isError, error } = useDocumentActivity(id ?? '', page, PAGE_SIZE);
  // The document itself, for the header. Without it the page is context-free -
  // a bookmarked or shared activity URL shows "Activity" and nothing about
  // which document - and Resend cannot know whether the document is still in a
  // state the endpoint will accept.
  const { data: document } = useDocument(id ?? '');
  const resendMutation = useResendToSigner();

  const items = data?.items ?? [];
  const canResend = data?.permissions?.canResend ?? false;
  const visibleItems = showFailuresOnly ? items.filter(isFailure) : items;
  const failureCount = items.filter(isFailure).length;
  const totalPages = data?.pagination?.total_pages ?? 0;
  // Only the row actually being resent should spin; one shared flag spins
  // every Resend button on a multi-signer document.
  const pendingSignerId = resendMutation.isPending
    ? (resendMutation.variables?.signerId ?? null)
    : null;

  const handleResend = async (item: ActivityItem) => {
    if (!id || !item.signerId) return;
    try {
      await resendMutation.mutateAsync({ documentId: id, signerId: item.signerId });
      toast.success('Signing email resent');
    } catch (err) {
      // The endpoint enforces a reminder limit and answers 429 with the
      // reason. Showing that verbatim matters: "you have already sent the
      // maximum number of reminders" is a different problem from "the address
      // bounced", and the whole point of this screen is to tell them apart.
      toast.error(extractApiErrorMessage(err, 'Could not resend the email'));
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <h1 className="text-2xl font-semibold">Activity</h1>
            {document?.title && (
              <p className="text-sm font-medium mt-1 break-words">
                {document.title}
                {document.status && (
                  <span className="ml-2 rounded-full bg-base-300 px-2 py-0.5 text-xs font-normal">
                    {document.status}
                  </span>
                )}
              </p>
            )}
            <p className="text-sm text-base-content/70 mt-1">
              Lifecycle events and every email we attempted for this document.
            </p>
          </div>
          <Button variant="ghost" onClick={() => navigate('/documents')}>
            Back to documents
          </Button>
        </div>

        {/*
          Stated, not implied. Audit writes are best-effort so they can never
          fail the operation they describe, and a crash between a commit and
          its record loses that row - so an absent entry is not evidence that
          nothing happened. Saying so here is cheaper than someone treating
          this screen as an attested log in a dispute.
        */}
        <p className="text-xs text-base-content/60 mb-6">
          This is a record of what we observed, not a legal attestation. Entries can be missing if
          the system was interrupted, and deleting a document removes its history entirely.
        </p>

        {failureCount > 0 && (
          <div
            className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"
            role="alert"
          >
            <span className="font-medium">
              {failureCount} email {failureCount === 1 ? 'attempt' : 'attempts'} on this page
              failed.
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFailuresOnly((v) => !v)}
              aria-pressed={showFailuresOnly}
            >
              {showFailuresOnly ? 'Show everything' : 'Show only failures'}
            </Button>
          </div>
        )}

        {isLoading && <p className="text-sm text-base-content/70">Loading activity…</p>}

        {isError && (
          <div
            className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error"
            role="alert"
          >
            {extractApiErrorMessage(error, 'Could not load this document’s activity.')}
          </div>
        )}

        {!isLoading && !isError && visibleItems.length === 0 && (
          // "No recorded activity" rather than "nothing happened": an empty
          // response is indistinguishable from a document whose history was
          // erased by a cascading delete.
          <p className="text-sm text-base-content/70">
            {showFailuresOnly
              ? 'No failed email attempts on this page.'
              : 'No recorded activity for this document.'}
          </p>
        )}

        <ol className="space-y-3">
          {visibleItems.map((item) => {
            const failed = isFailure(item);
            const subject = subjectOf(item);
            return (
              <li
                key={`${item.kind}-${item.id}`}
                className={`rounded-lg border p-4 ${
                  failed ? 'border-error bg-error/5' : 'border-base-300'
                }`}
                data-testid={failed ? 'activity-row-failed' : 'activity-row'}
              >
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="text-lg leading-none mt-0.5">
                    {iconFor(item)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{labelFor(item)}</span>
                      {item.kind === 'email' && item.status && (
                        // Shown on every email row, not only failures: a
                        // still-queued send is otherwise indistinguishable from
                        // a delivered one, and "it says sent but they never got
                        // it" is unanswerable without it.
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            failed ? 'bg-error/15 text-error' : 'bg-base-300 text-base-content/70'
                          }`}
                        >
                          {item.status}
                        </span>
                      )}
                      <time className="text-xs text-base-content/60" dateTime={item.createdAt}>
                        {formatTimestamp(item.createdAt)}
                      </time>
                    </div>

                    {subject && (
                      <p className="text-sm text-base-content/80 mt-1 break-words">{subject}</p>
                    )}

                    {item.subject && (
                      <p className="text-xs text-base-content/60 mt-1 break-words">
                        Subject: {item.subject}
                      </p>
                    )}

                    {/*
                      The reason a send failed is the entire point of this
                      screen, so it is given weight rather than tucked into a
                      tooltip or a details toggle.
                    */}
                    {failed && item.errorMessage && (
                      <p className="text-sm text-error mt-2 break-words" data-testid="activity-error">
                        {item.errorMessage}
                      </p>
                    )}

                    {item.type === 'viewed' && (
                      // Mail-security scanners (Defender Safe Links, Proofpoint)
                      // fetch every link, and the first fetch is what claims
                      // this event - so it may not be the signer at all. Do not
                      // let the UI present it as attested.
                      <p className="text-xs text-base-content/50 mt-1">
                        First open of the signing link. Automated link scanners can trigger this
                        before the signer sees it.
                      </p>
                    )}
                  </div>

                  {canResendItem(item, canResend, document?.status) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleResend(item)}
                      loading={pendingSignerId === item.signerId}
                      disabled={resendMutation.isPending}
                    >
                      Resend
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {failureCount > 0 && !canResend && (
          <p className="text-xs text-base-content/60 mt-4">
            You are viewing this document as an instance administrator. Resending is available to
            the document owner and their team.
          </p>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs text-base-content/60">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default DocumentActivity;
