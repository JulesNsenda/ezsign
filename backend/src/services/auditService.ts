import { Pool } from 'pg';
import { AuditEvent, AuditEventType, CreateAuditEventData, AuditEventData } from '@/models/AuditEvent';
import {
  decodeCursor,
  encodeCursor,
  validatePaginationParams,
} from '@/utils/pagination';

/**
 * Keyset pagination options for audit events
 */
export interface AuditKeysetOptions {
  documentId?: string;
  userId?: string;
  eventType?: AuditEventType;
  limit?: number;
  cursor?: string;
  includeTotal?: boolean;
}

/**
 * Keyset paginated audit events result
 */
export interface KeysetPaginatedAuditEvents {
  events: AuditEvent[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export class AuditService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Log an audit event
   */
  async logEvent(data: CreateAuditEventData): Promise<AuditEvent> {
    const result = await this.pool.query(
      `INSERT INTO audit_events (document_id, user_id, event_type, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.document_id || null,
        data.user_id || null,
        data.event_type,
        data.ip_address || null,
        data.user_agent || null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ]
    );

    return new AuditEvent(this.mapRowToAuditEventData(result.rows[0]));
  }

  /**
   * Get audit trail for a document
   */
  async getAuditTrail(
    documentId: string,
    options?: {
      eventType?: AuditEventType;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ events: AuditEvent[]; total: number }> {
    let query = 'SELECT * FROM audit_events WHERE document_id = $1';
    const params: any[] = [documentId];
    let paramIndex = 2;

    if (options?.eventType) {
      query += ` AND event_type = $${paramIndex}`;
      params.push(options.eventType);
      paramIndex++;
    }

    // Get total count
    const countResult = await this.pool.query(
      query.replace('SELECT *', 'SELECT COUNT(*)'),
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get events with pagination
    query += ' ORDER BY created_at DESC';
    if (options?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
      paramIndex++;
    }
    if (options?.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(options.offset);
    }

    const result = await this.pool.query(query, params);
    const events = result.rows.map((row) => new AuditEvent(this.mapRowToAuditEventData(row)));

    return { events, total };
  }

  /**
   * Get audit events for a user
   */
  async getUserAuditTrail(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<{ events: AuditEvent[]; total: number }> {
    let query = 'SELECT * FROM audit_events WHERE user_id = $1';
    const params: any[] = [userId];

    // Get total count
    const countResult = await this.pool.query(
      query.replace('SELECT *', 'SELECT COUNT(*)'),
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get events with pagination
    query += ' ORDER BY created_at DESC';
    if (options?.limit) {
      query += ` LIMIT $2`;
      params.push(options.limit);
    }
    if (options?.offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(options.offset);
    }

    const result = await this.pool.query(query, params);
    const events = result.rows.map((row) => new AuditEvent(this.mapRowToAuditEventData(row)));

    return { events, total };
  }

  /**
   * Get audit events with keyset pagination (cursor-based)
   * More efficient than OFFSET for large datasets
   */
  async getAuditEventsKeyset(
    options: AuditKeysetOptions
  ): Promise<KeysetPaginatedAuditEvents> {
    const limit = validatePaginationParams(options.limit, 100, 50);

    // Build WHERE conditions
    const conditions: string[] = [];
    const values: (string | number | Date | null)[] = [];
    let paramCount = 1;

    if (options.documentId) {
      conditions.push(`document_id = $${paramCount++}`);
      values.push(options.documentId);
    }

    if (options.userId) {
      conditions.push(`user_id = $${paramCount++}`);
      values.push(options.userId);
    }

    if (options.eventType) {
      conditions.push(`event_type = $${paramCount++}`);
      values.push(options.eventType);
    }

    // Handle cursor for keyset pagination
    if (options.cursor) {
      const cursorData = decodeCursor(options.cursor);
      if (cursorData) {
        // For audit events, we always sort by created_at DESC
        // Using (created_at, id) for stable cursor
        if (cursorData.value !== null) {
          conditions.push(`(
            (created_at < $${paramCount})
            OR (created_at = $${paramCount} AND id < $${paramCount + 1})
          )`);
          values.push(cursorData.value, cursorData.id);
          paramCount += 2;
        } else {
          conditions.push(`id < $${paramCount++}`);
          values.push(cursorData.id);
        }
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Fetch one extra to determine if there are more results
    const fetchLimit = limit + 1;

    const query = `
      SELECT id, document_id, user_id, event_type, ip_address,
             user_agent, metadata, created_at
      FROM audit_events
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT $${paramCount}
    `;

    values.push(fetchLimit);

    const result = await this.pool.query(query, values);

    // Check if there are more results
    const hasMore = result.rows.length > limit;
    const eventRows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const events = eventRows.map((row) => new AuditEvent(this.mapRowToAuditEventData(row)));

    // Generate next cursor from last item
    let nextCursor: string | null = null;
    if (hasMore && events.length > 0) {
      const lastEvent = events[events.length - 1];
      if (lastEvent) {
        nextCursor = encodeCursor({
          value: lastEvent.created_at,
          id: lastEvent.id,
        });
      }
    }

    // Optionally get total count
    let total: number | undefined;
    if (options.includeTotal) {
      const countConditions: string[] = [];
      const countValues: (string | number | Date | null)[] = [];
      let countParamIndex = 1;

      if (options.documentId) {
        countConditions.push(`document_id = $${countParamIndex++}`);
        countValues.push(options.documentId);
      }
      if (options.userId) {
        countConditions.push(`user_id = $${countParamIndex++}`);
        countValues.push(options.userId);
      }
      if (options.eventType) {
        countConditions.push(`event_type = $${countParamIndex++}`);
        countValues.push(options.eventType);
      }

      const countWhereClause = countConditions.length > 0
        ? `WHERE ${countConditions.join(' AND ')}`
        : '';

      const countQuery = `SELECT COUNT(*) as total FROM audit_events ${countWhereClause}`;
      const countResult = await this.pool.query(countQuery, countValues);
      total = parseInt(countResult.rows[0]?.count || '0', 10);
    }

    return {
      events,
      nextCursor,
      hasMore,
      total,
    };
  }

  /**
   * Map database row to AuditEventData
   */
  private mapRowToAuditEventData(row: Record<string, any>): AuditEventData {
    return {
      id: row.id,
      document_id: row.document_id,
      user_id: row.user_id,
      event_type: row.event_type,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      metadata: row.metadata,
      created_at: row.created_at,
    };
  }
}
