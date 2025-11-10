import { Pool } from 'pg';
import { AuditEvent, AuditEventType, CreateAuditEventData, AuditEventData } from '@/models/AuditEvent';

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
