export type AuditEventType =
  | 'created'
  | 'updated'
  | 'sent'
  | 'viewed'
  | 'signed'
  | 'declined'
  | 'completed'
  | 'cancelled'
  | 'deleted'
  | 'downloaded';

export interface AuditEventData {
  id: string;
  document_id: string | null;
  user_id: string | null;
  event_type: AuditEventType;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, any> | null;
  created_at: Date;
}

export interface CreateAuditEventData {
  document_id?: string | null;
  user_id?: string | null;
  event_type: AuditEventType;
  ip_address?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, any> | null;
}

export class AuditEvent {
  id: string;
  document_id: string | null;
  user_id: string | null;
  event_type: AuditEventType;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, any> | null;
  created_at: Date;

  constructor(data: AuditEventData) {
    this.id = data.id;
    this.document_id = data.document_id;
    this.user_id = data.user_id;
    this.event_type = data.event_type;
    this.ip_address = data.ip_address;
    this.user_agent = data.user_agent;
    this.metadata = data.metadata;
    this.created_at = data.created_at;
  }

  /**
   * Validate event type
   */
  static isValidEventType(type: string): type is AuditEventType {
    const validTypes: AuditEventType[] = [
      'created',
      'updated',
      'sent',
      'viewed',
      'signed',
      'declined',
      'completed',
      'cancelled',
      'deleted',
      'downloaded',
    ];
    return validTypes.includes(type as AuditEventType);
  }

  /**
   * Get human-readable event description
   */
  getDescription(): string {
    const descriptions: Record<AuditEventType, string> = {
      created: 'Document created',
      updated: 'Document updated',
      sent: 'Document sent for signature',
      viewed: 'Document viewed',
      signed: 'Document signed',
      declined: 'Document declined',
      completed: 'Document completed',
      cancelled: 'Document cancelled',
      deleted: 'Document deleted',
      downloaded: 'Document downloaded',
    };
    return descriptions[this.event_type] || 'Unknown event';
  }

  /**
   * Check if event is a critical action
   */
  isCriticalEvent(): boolean {
    const criticalEvents: AuditEventType[] = ['deleted', 'cancelled', 'declined'];
    return criticalEvents.includes(this.event_type);
  }

  /**
   * Check if event is a signature-related action
   */
  isSignatureEvent(): boolean {
    const signatureEvents: AuditEventType[] = ['sent', 'signed', 'declined', 'completed'];
    return signatureEvents.includes(this.event_type);
  }

  /**
   * Get formatted timestamp
   */
  getFormattedTimestamp(): string {
    return this.created_at.toISOString();
  }

  /**
   * Extract user info from metadata
   */
  getUserInfo(): {
    email?: string;
    name?: string;
    role?: string;
  } {
    if (!this.metadata) return {};

    return {
      email: this.metadata.user_email,
      name: this.metadata.user_name,
      role: this.metadata.user_role,
    };
  }

  /**
   * Convert to JSON
   */
  toJSON(): AuditEventData {
    return {
      id: this.id,
      document_id: this.document_id,
      user_id: this.user_id,
      event_type: this.event_type,
      ip_address: this.ip_address,
      user_agent: this.user_agent,
      metadata: this.metadata,
      created_at: this.created_at,
    };
  }

  /**
   * Convert to public JSON (exclude sensitive data)
   */
  toPublicJSON(): Omit<AuditEventData, 'ip_address' | 'user_agent'> & {
    description: string;
    formatted_timestamp: string;
  } {
    return {
      id: this.id,
      document_id: this.document_id,
      user_id: this.user_id,
      event_type: this.event_type,
      metadata: this.metadata,
      created_at: this.created_at,
      description: this.getDescription(),
      formatted_timestamp: this.getFormattedTimestamp(),
    };
  }
}
