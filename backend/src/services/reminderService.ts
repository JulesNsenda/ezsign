/**
 * Reminder Service
 *
 * Manages document deadline reminders - scheduling, cancellation, and tracking.
 */

import { Pool } from 'pg';
import { enqueue, cancelJob, QueueName } from '@/config/queue';
import logger from '@/services/loggerService';

export type ReminderType = '1_day' | '3_day' | '7_day' | 'custom' | 'owner';

export interface DocumentReminder {
  id: string;
  documentId: string;
  signerId: string | null;
  reminderType: ReminderType;
  scheduledFor: Date;
  sentAt: Date | null;
  jobId: string | null;
  createdAt: Date;
}

export interface ReminderJobData {
  documentId: string;
  signerId: string | null;
  reminderType: ReminderType;
  reminderId: string;
}

/**
 * Cancel a pg-boss job by id, tolerating the cases where there is nothing
 * left to cancel: the job no longer exists, or it already reached a
 * terminal state (completed/failed/cancelled). pg-boss's own `cancel` only
 * touches non-terminal rows and silently no-ops in that case, but a
 * stale/malformed id (e.g. a leftover BullMQ-era value from before this
 * migration) can still throw at the DB layer - swallow that too, since the
 * caller's job here is deleting the reminder record either way.
 */
const cancelReminderJobTolerant = async (jobId: string, reminderId: string): Promise<void> => {
  try {
    await cancelJob(QueueName.DEADLINE_REMINDERS, jobId);
  } catch (error) {
    logger.debug('Reminder cancelJob no-op (job missing, terminal, or stale id)', {
      reminderId,
      jobId,
      error: (error as Error).message,
    });
  }
};

/**
 * Create reminder service with database connection
 */
export const createReminderService = (pool: Pool) => {
  /**
   * Schedule reminders for a document based on its expiration and reminder settings
   */
  const scheduleRemindersForDocument = async (
    documentId: string
  ): Promise<DocumentReminder[]> => {
    // Get document with expiration info
    const docResult = await pool.query(
      `SELECT id, title, expires_at, reminder_settings, status
       FROM documents WHERE id = $1`,
      [documentId]
    );

    if (docResult.rows.length === 0) {
      throw new Error('Document not found');
    }

    const doc = docResult.rows[0];

    // Don't schedule if no expiration or reminders disabled
    if (!doc.expires_at) {
      logger.debug('No expiration date, skipping reminder scheduling', { documentId });
      return [];
    }

    const reminderSettings = doc.reminder_settings || { enabled: true, intervals: [1, 3, 7] };
    if (!reminderSettings.enabled) {
      logger.debug('Reminders disabled for document', { documentId });
      return [];
    }

    // Get pending signers
    const signersResult = await pool.query(
      `SELECT id, email, name FROM signers
       WHERE document_id = $1 AND status = 'pending'`,
      [documentId]
    );

    const expiresAt = new Date(doc.expires_at);
    const now = new Date();
    const createdReminders: DocumentReminder[] = [];

    // Schedule reminders for each interval and each pending signer
    for (const days of reminderSettings.intervals) {
      const reminderTime = new Date(expiresAt.getTime() - days * 24 * 60 * 60 * 1000);
      const reminderType: ReminderType = `${days}_day` as ReminderType;

      // Skip if reminder time is in the past
      if (reminderTime <= now) {
        continue;
      }

      // Schedule reminder for each pending signer
      for (const signer of signersResult.rows) {
        try {
          const reminder = await scheduleReminder(
            documentId,
            signer.id,
            reminderType,
            reminderTime
          );
          if (reminder) {
            createdReminders.push(reminder);
          }
        } catch (error) {
          logger.warn('Failed to schedule reminder for signer', {
            documentId,
            signerId: signer.id,
            reminderType,
            error: (error as Error).message,
          });
        }
      }
    }

    logger.info('Scheduled reminders for document', {
      documentId,
      reminderCount: createdReminders.length,
    });

    return createdReminders;
  };

  /**
   * Schedule a single reminder
   */
  const scheduleReminder = async (
    documentId: string,
    signerId: string | null,
    reminderType: ReminderType,
    scheduledFor: Date
  ): Promise<DocumentReminder | null> => {
    // Check if reminder already exists
    const existingQuery = signerId
      ? `SELECT id FROM document_reminders
         WHERE document_id = $1 AND signer_id = $2 AND reminder_type = $3`
      : `SELECT id FROM document_reminders
         WHERE document_id = $1 AND signer_id IS NULL AND reminder_type = $2`;

    const existingParams = signerId
      ? [documentId, signerId, reminderType]
      : [documentId, reminderType];

    const existing = await pool.query(existingQuery, existingParams);

    if (existing.rows.length > 0) {
      logger.debug('Reminder already scheduled', { documentId, signerId, reminderType });
      return null;
    }

    // Create reminder record
    const insertResult = await pool.query(
      `INSERT INTO document_reminders (document_id, signer_id, reminder_type, scheduled_for)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [documentId, signerId, reminderType, scheduledFor]
    );

    const reminder = mapRowToReminder(insertResult.rows[0]);

    // Enqueue with the target send time. No singletonKey: the
    // (document_id, signer_id, reminder_type) unique index above already
    // guarantees at most one reminder row per signer/interval, so pg-boss
    // dedupe is not needed here (decision 8 - reminder.id is unique per row).
    const jobData: ReminderJobData = {
      documentId,
      signerId,
      reminderType,
      reminderId: reminder.id,
    };

    const jobId = await enqueue(QueueName.DEADLINE_REMINDERS, jobData, {
      startAfter: scheduledFor,
    });

    if (!jobId) {
      // Without a singletonKey, enqueue should never suppress the send -
      // treat a null return as an unexpected failure rather than leaving an
      // orphaned reminder row with no job to ever fire or cancel.
      await pool.query('DELETE FROM document_reminders WHERE id = $1', [reminder.id]);
      throw new Error(`Failed to enqueue reminder ${reminder.id}: enqueue returned no job id`);
    }

    // Update reminder with the pg-boss-returned job ID (decision 8: this
    // replaces the old deterministic BullMQ jobId as the sole way to
    // cancel/track this job later).
    await pool.query(
      'UPDATE document_reminders SET job_id = $1 WHERE id = $2',
      [jobId, reminder.id]
    );

    reminder.jobId = jobId;

    logger.debug('Reminder scheduled', {
      reminderId: reminder.id,
      documentId,
      signerId,
      reminderType,
      scheduledFor,
      jobId,
    });

    return reminder;
  };

  /**
   * Cancel all pending reminders for a document
   */
  const cancelRemindersForDocument = async (documentId: string): Promise<number> => {
    // Get pending reminders
    const result = await pool.query(
      `SELECT id, job_id FROM document_reminders
       WHERE document_id = $1 AND sent_at IS NULL`,
      [documentId]
    );

    let cancelledCount = 0;

    for (const row of result.rows) {
      try {
        // Cancel the pg-boss job if one was persisted (tolerant of
        // missing/already-terminal jobs - see cancelReminderJobTolerant).
        if (row.job_id) {
          await cancelReminderJobTolerant(row.job_id, row.id);
        }

        // Delete reminder record
        await pool.query('DELETE FROM document_reminders WHERE id = $1', [row.id]);
        cancelledCount++;
      } catch (error) {
        logger.warn('Failed to cancel reminder', {
          reminderId: row.id,
          error: (error as Error).message,
        });
      }
    }

    logger.info('Cancelled reminders for document', { documentId, cancelledCount });

    return cancelledCount;
  };

  /**
   * Cancel reminders for a specific signer (e.g., when they sign)
   */
  const cancelRemindersForSigner = async (signerId: string): Promise<number> => {
    const result = await pool.query(
      `SELECT id, job_id FROM document_reminders
       WHERE signer_id = $1 AND sent_at IS NULL`,
      [signerId]
    );

    let cancelledCount = 0;

    for (const row of result.rows) {
      try {
        if (row.job_id) {
          await cancelReminderJobTolerant(row.job_id, row.id);
        }
        await pool.query('DELETE FROM document_reminders WHERE id = $1', [row.id]);
        cancelledCount++;
      } catch (error) {
        logger.warn('Failed to cancel signer reminder', {
          reminderId: row.id,
          error: (error as Error).message,
        });
      }
    }

    logger.debug('Cancelled reminders for signer', { signerId, cancelledCount });

    return cancelledCount;
  };

  /**
   * Mark a reminder as sent
   */
  const markReminderAsSent = async (reminderId: string): Promise<void> => {
    await pool.query(
      'UPDATE document_reminders SET sent_at = CURRENT_TIMESTAMP WHERE id = $1',
      [reminderId]
    );
  };

  /**
   * Get pending reminders for a document
   */
  const getPendingReminders = async (documentId: string): Promise<DocumentReminder[]> => {
    const result = await pool.query(
      `SELECT * FROM document_reminders
       WHERE document_id = $1 AND sent_at IS NULL
       ORDER BY scheduled_for ASC`,
      [documentId]
    );

    return result.rows.map(mapRowToReminder);
  };

  /**
   * Get sent reminders for a document
   */
  const getSentReminders = async (documentId: string): Promise<DocumentReminder[]> => {
    const result = await pool.query(
      `SELECT * FROM document_reminders
       WHERE document_id = $1 AND sent_at IS NOT NULL
       ORDER BY sent_at DESC`,
      [documentId]
    );

    return result.rows.map(mapRowToReminder);
  };

  /**
   * Get reminder by ID
   */
  const getReminderById = async (reminderId: string): Promise<DocumentReminder | null> => {
    const result = await pool.query(
      'SELECT * FROM document_reminders WHERE id = $1',
      [reminderId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToReminder(result.rows[0]);
  };

  /**
   * Get documents expiring soon (for dashboard widget)
   */
  const getExpiringSoonDocuments = async (
    userId: string,
    daysAhead: number = 7
  ): Promise<Array<{
    id: string;
    title: string;
    expiresAt: Date;
    daysUntilExpiration: number;
    pendingSignersCount: number;
  }>> => {
    const result = await pool.query(
      `SELECT
         d.id, d.title, d.expires_at,
         CEIL(EXTRACT(EPOCH FROM (d.expires_at - NOW())) / 86400) as days_until_expiration,
         COUNT(s.id) FILTER (WHERE s.status = 'pending') as pending_signers_count
       FROM documents d
       LEFT JOIN signers s ON s.document_id = d.id
       WHERE d.user_id = $1
         AND d.status = 'pending'
         AND d.expires_at IS NOT NULL
         AND d.expires_at > NOW()
         AND d.expires_at <= NOW() + INTERVAL '${daysAhead} days'
       GROUP BY d.id
       ORDER BY d.expires_at ASC`,
      [userId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      expiresAt: new Date(row.expires_at),
      daysUntilExpiration: parseInt(row.days_until_expiration, 10),
      pendingSignersCount: parseInt(row.pending_signers_count, 10),
    }));
  };

  return {
    scheduleRemindersForDocument,
    scheduleReminder,
    cancelRemindersForDocument,
    cancelRemindersForSigner,
    markReminderAsSent,
    getPendingReminders,
    getSentReminders,
    getReminderById,
    getExpiringSoonDocuments,
  };
};

/**
 * Map database row to DocumentReminder object
 */
function mapRowToReminder(row: Record<string, unknown>): DocumentReminder {
  return {
    id: row.id as string,
    documentId: row.document_id as string,
    signerId: row.signer_id as string | null,
    reminderType: row.reminder_type as ReminderType,
    scheduledFor: new Date(row.scheduled_for as string),
    sentAt: row.sent_at ? new Date(row.sent_at as string) : null,
    jobId: row.job_id as string | null,
    createdAt: new Date(row.created_at as string),
  };
}

export type ReminderService = ReturnType<typeof createReminderService>;
