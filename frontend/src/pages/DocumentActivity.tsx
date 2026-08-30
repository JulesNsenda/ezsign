import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import { useDocumentActivity, useResendSignerEmail } from '@/hooks/useDocumentActivity';
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

/** Email statuses that represent a delivery failure worth acting on. */
const FAILED_STATUSES = new Set(['failed', 'bounced']);

function isFailure(item: ActivityItem): boolean {
  return item.kind === 'email' && !!item.status && FAILED_STATUSES.has(item.status);
}

/**
 * A failed row is resendable only when the signer actually resolved. The
 * signer join returns null where a row's recorded signer no longer matches
 * one on this document, and the resend endpoint is addressed by signer id -
 * so without it there is nothing to resend to.
 */
function canResendItem(item: ActivityItem, canResend: boolean): boolean {
  return canResend && isFailure(item) && !!item.signerId;
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
  const resendMutation = useResendSignerEmail();

  const items = data?.items ?? [];
  const canResend = data?.permissions?.canResend ?? false;
  const visibleItems = showFailuresOnly ? items.filter(isFailure) : items;
  const failureCount = items.filter(isFailure).length;
  const totalPages = data?.pagination?.total_pages ?? 0;

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
      const response = (err as { response?: { data?: { message?: string; error?: string } } })
        .response;
      toast.error(response?.data?.message ?? response?.data?.error ?? 'Could not resend the email');
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <h1 className="text-2xl font-semibold">Activity</h1>
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
            {(error as Error)?.message ?? 'Could not load this document’s activity.'}
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
                      {failed && (
                        <span className="rounded-full bg-error/15 px-2 py-0.5 text-xs font-medium text-error">
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

                  {canResendItem(item, canResend) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleResend(item)}
                      loading={resendMutation.isPending}
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
