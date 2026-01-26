/**
 * Email Log Service
 *
 * Tracks all outgoing emails for delivery status monitoring
 */

import { Pool } from 'pg';
import logger from '@/services/loggerService';

export type EmailType =
  | 'signing_request'
  | 'reminder'
  | 'completion'
  | 'password_change'
  | 'verification'
  | 'welcome'
  | 'password_reset';

export type EmailStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'failed'
  | 'opened';

export interface EmailLogData {
  documentId?: string;
  signerId?: string;
  userId?: string;
  recipientEmail: string;
  emailType: EmailType;
  subject: string;
  metadata?: Record<string, unknown>;
}

export interface EmailLog {
  id: string;
  documentId: string | null;
  signerId: string | null;
  userId: string | null;
  recipientEmail: string;
  emailType: EmailType;
  subject: string;
  status: EmailStatus;
  errorMessage: string | null;
  messageId: string | null;
  metadata: Record<string, unknown> | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  openedAt: Date | null;
  createdAt: Date;
}

export interface EmailLogFilter {
  documentId?: string;
  signerId?: string;
  userId?: string;
  recipientEmail?: string;
  emailType?: EmailType;
  status?: EmailStatus;
  startDate?: Date;
  endDate?: Date;
}

export interface PaginatedEmailLogs {
  logs: EmailLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Create email log service with database connection
 */
export const createEmailLogService = (pool: Pool) => {
  /**
   * Create a new email log entry (status: queued)
   */
  const createLog = async (data: EmailLogData): Promise<EmailLog> => {
    const query = `
      INSERT INTO email_logs (
        document_id, signer_id, user_id, recipient_email,
        email_type, subject, metadata, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued')
      RETURNING *
    `;

    const result = await pool.query(query, [
      data.documentId || null,
      data.signerId || null,
      data.userId || null,
      data.recipientEmail,
      data.emailType,
      data.subject,
      data.metadata ? JSON.stringify(data.metadata) : null,
    ]);

    logger.debug('Email log created', {
      emailLogId: result.rows[0].id,
      emailType: data.emailType,
      recipient: data.recipientEmail,
    });

    return mapRowToEmailLog(result.rows[0]);
  };

  /**
   * Update email status to 'sent' with message ID
   */
  const markAsSent = async (
    logId: string,
    messageId?: string
  ): Promise<void> => {
    const query = `
      UPDATE email_logs
      SET status = 'sent', message_id = $2, sent_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await pool.query(query, [logId, messageId || null]);

    logger.debug('Email marked as sent', { emailLogId: logId, messageId });
  };

  /**
   * Update email status to 'delivered'
   */
  const markAsDelivered = async (logId: string): Promise<void> => {
    const query = `
      UPDATE email_logs
      SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await pool.query(query, [logId]);
    logger.debug('Email marked as delivered', { emailLogId: logId });
  };

  /**
   * Update email status to 'failed' with error message
   */
  const markAsFailed = async (
    logId: string,
    errorMessage: string
  ): Promise<void> => {
    const query = `
      UPDATE email_logs
      SET status = 'failed', error_message = $2
      WHERE id = $1
    `;

    await pool.query(query, [logId, errorMessage]);
    logger.warn('Email marked as failed', { emailLogId: logId, errorMessage });
  };

  /**
   * Update email status to 'bounced'
   */
  const markAsBounced = async (
    logId: string,
    errorMessage?: string
  ): Promise<void> => {
    const query = `
      UPDATE email_logs
      SET status = 'bounced', error_message = $2
      WHERE id = $1
    `;

    await pool.query(query, [logId, errorMessage || null]);
    logger.warn('Email marked as bounced', { emailLogId: logId });
  };

  /**
   * Update email status to 'opened'
   */
  const markAsOpened = async (logId: string): Promise<void> => {
    const query = `
      UPDATE email_logs
      SET status = 'opened', opened_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status != 'opened'
    `;

    await pool.query(query, [logId]);
    logger.debug('Email marked as opened', { emailLogId: logId });
  };

  /**
   * Get email log by ID
   */
  const getById = async (logId: string): Promise<EmailLog | null> => {
    const query = `SELECT * FROM email_logs WHERE id = $1`;
    const result = await pool.query(query, [logId]);

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToEmailLog(result.rows[0]);
  };

  /**
   * Get email log by message ID
   */
  const getByMessageId = async (messageId: string): Promise<EmailLog | null> => {
    const query = `SELECT * FROM email_logs WHERE message_id = $1`;
    const result = await pool.query(query, [messageId]);

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToEmailLog(result.rows[0]);
  };

  /**
   * Get emails by document ID
   */
  const getByDocumentId = async (
    documentId: string,
    page = 1,
    pageSize = 20
  ): Promise<PaginatedEmailLogs> => {
    return queryLogs({ documentId }, page, pageSize);
  };

  /**
   * Get emails by signer ID
   */
  const getBySignerId = async (
    signerId: string,
    page = 1,
    pageSize = 20
  ): Promise<PaginatedEmailLogs> => {
    return queryLogs({ signerId }, page, pageSize);
  };

  /**
   * Get emails by user ID
   */
  const getByUserId = async (
    userId: string,
    page = 1,
    pageSize = 20
  ): Promise<PaginatedEmailLogs> => {
    return queryLogs({ userId }, page, pageSize);
  };

  /**
   * Query logs with filters and pagination
   */
  const queryLogs = async (
    filter: EmailLogFilter,
    page = 1,
    pageSize = 20
  ): Promise<PaginatedEmailLogs> => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filter.documentId) {
      conditions.push(`document_id = $${paramIndex++}`);
      params.push(filter.documentId);
    }

    if (filter.signerId) {
      conditions.push(`signer_id = $${paramIndex++}`);
      params.push(filter.signerId);
    }

    if (filter.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(filter.userId);
    }

    if (filter.recipientEmail) {
      conditions.push(`recipient_email = $${paramIndex++}`);
      params.push(filter.recipientEmail);
    }

    if (filter.emailType) {
      conditions.push(`email_type = $${paramIndex++}`);
      params.push(filter.emailType);
    }

    if (filter.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filter.status);
    }

    if (filter.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filter.startDate);
    }

    if (filter.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filter.endDate);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    const countQuery = `SELECT COUNT(*) FROM email_logs ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    // Get page of results
    const offset = (page - 1) * pageSize;
    const dataQuery = `
      SELECT * FROM email_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const dataResult = await pool.query(dataQuery, [...params, pageSize, offset]);

    return {
      logs: dataResult.rows.map(mapRowToEmailLog),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  };

  /**
   * Get email statistics for a document
   */
  const getDocumentEmailStats = async (
    documentId: string
  ): Promise<{
    total: number;
    byStatus: Record<EmailStatus, number>;
    byType: Record<EmailType, number>;
  }> => {
    const statusQuery = `
      SELECT status, COUNT(*) as count
      FROM email_logs
      WHERE document_id = $1
      GROUP BY status
    `;

    const typeQuery = `
      SELECT email_type, COUNT(*) as count
      FROM email_logs
      WHERE document_id = $1
      GROUP BY email_type
    `;

    const [statusResult, typeResult] = await Promise.all([
      pool.query(statusQuery, [documentId]),
      pool.query(typeQuery, [documentId]),
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of statusResult.rows) {
      byStatus[row.status] = parseInt(row.count, 10);
    }

    const byType: Record<string, number> = {};
    for (const row of typeResult.rows) {
      byType[row.email_type] = parseInt(row.count, 10);
    }

    const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

    return {
      total,
      byStatus: byStatus as Record<EmailStatus, number>,
      byType: byType as Record<EmailType, number>,
    };
  };

  /**
   * Delete old email logs (for cleanup/retention)
   */
  const deleteOlderThan = async (days: number): Promise<number> => {
    const query = `
      DELETE FROM email_logs
      WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '${days} days'
      RETURNING id
    `;

    const result = await pool.query(query);
    const deletedCount = result.rowCount || 0;

    logger.info('Deleted old email logs', { deletedCount, olderThanDays: days });

    return deletedCount;
  };

  return {
    createLog,
    markAsSent,
    markAsDelivered,
    markAsFailed,
    markAsBounced,
    markAsOpened,
    getById,
    getByMessageId,
    getByDocumentId,
    getBySignerId,
    getByUserId,
    queryLogs,
    getDocumentEmailStats,
    deleteOlderThan,
  };
};

/**
 * Map database row to EmailLog object
 */
function mapRowToEmailLog(row: Record<string, unknown>): EmailLog {
  return {
    id: row.id as string,
    documentId: row.document_id as string | null,
    signerId: row.signer_id as string | null,
    userId: row.user_id as string | null,
    recipientEmail: row.recipient_email as string,
    emailType: row.email_type as EmailType,
    subject: row.subject as string,
    status: row.status as EmailStatus,
    errorMessage: row.error_message as string | null,
    messageId: row.message_id as string | null,
    metadata: row.metadata as Record<string, unknown> | null,
    sentAt: row.sent_at ? new Date(row.sent_at as string) : null,
    deliveredAt: row.delivered_at ? new Date(row.delivered_at as string) : null,
    openedAt: row.opened_at ? new Date(row.opened_at as string) : null,
    createdAt: new Date(row.created_at as string),
  };
}

export type EmailLogService = ReturnType<typeof createEmailLogService>;
