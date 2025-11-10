import { randomBytes } from 'crypto';

export type SignerStatus = 'pending' | 'signed' | 'declined';

export interface SignerData {
  id: string;
  document_id: string;
  email: string;
  name: string;
  signing_order: number | null;
  status: SignerStatus;
  access_token: string;
  signed_at: Date | null;
  ip_address: string | null;
  user_agent: string | null;
  last_reminder_sent_at: Date | null;
  reminder_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSignerData {
  document_id: string;
  email: string;
  name: string;
  signing_order?: number | null;
  status?: SignerStatus;
}

export interface UpdateSignerData {
  email?: string;
  name?: string;
  signing_order?: number | null;
  status?: SignerStatus;
}

export class Signer {
  id: string;
  document_id: string;
  email: string;
  name: string;
  signing_order: number | null;
  status: SignerStatus;
  access_token: string;
  signed_at: Date | null;
  ip_address: string | null;
  user_agent: string | null;
  last_reminder_sent_at: Date | null;
  reminder_count: number;
  created_at: Date;
  updated_at: Date;

  constructor(data: SignerData) {
    this.id = data.id;
    this.document_id = data.document_id;
    this.email = data.email;
    this.name = data.name;
    this.signing_order = data.signing_order;
    this.status = data.status;
    this.access_token = data.access_token;
    this.signed_at = data.signed_at;
    this.ip_address = data.ip_address;
    this.user_agent = data.user_agent;
    this.last_reminder_sent_at = data.last_reminder_sent_at;
    this.reminder_count = data.reminder_count;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  /**
   * Generate a secure access token for signing
   */
  static generateAccessToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Check if signer has signed the document
   */
  hasSigned(): boolean {
    return this.status === 'signed';
  }

  /**
   * Check if signer has declined the document
   */
  hasDeclined(): boolean {
    return this.status === 'declined';
  }

  /**
   * Check if signer is pending
   */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Check if signer can sign (status is pending)
   */
  canSign(): boolean {
    return this.status === 'pending';
  }

  /**
   * Mark signer as signed with metadata
   */
  markAsSigned(ipAddress?: string, userAgent?: string): void {
    if (!this.canSign()) {
      throw new Error('Signer cannot sign in current state');
    }
    this.status = 'signed';
    this.signed_at = new Date();
    this.ip_address = ipAddress || null;
    this.user_agent = userAgent || null;
  }

  /**
   * Mark signer as declined
   */
  markAsDeclined(): void {
    if (!this.canSign()) {
      throw new Error('Signer cannot decline in current state');
    }
    this.status = 'declined';
  }

  /**
   * Reset signer to pending status (admin action)
   */
  resetToPending(): void {
    this.status = 'pending';
    this.signed_at = null;
    this.ip_address = null;
    this.user_agent = null;
  }

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate signer email
   */
  validateEmail(): boolean {
    return Signer.isValidEmail(this.email);
  }

  /**
   * Validate signing order
   */
  static isValidSigningOrder(order: number | null): boolean {
    if (order === null) {
      return true; // Null is valid for parallel workflows
    }
    return Number.isInteger(order) && order >= 0;
  }

  /**
   * Validate this signer's signing order
   */
  validateSigningOrder(): boolean {
    return Signer.isValidSigningOrder(this.signing_order);
  }

  /**
   * Check if signer has a signing order (for sequential workflows)
   */
  hasSigningOrder(): boolean {
    return this.signing_order !== null;
  }

  /**
   * Get signing link URL (requires base URL from config)
   */
  getSigningUrl(baseUrl: string): string {
    return `${baseUrl}/sign/${this.access_token}`;
  }

  /**
   * Validate signer status
   */
  static isValidStatus(status: string): status is SignerStatus {
    return ['pending', 'signed', 'declined'].includes(status);
  }

  /**
   * Get status display text
   */
  getStatusDisplay(): string {
    const statusDisplayMap: Record<SignerStatus, string> = {
      pending: 'Pending',
      signed: 'Signed',
      declined: 'Declined',
    };
    return statusDisplayMap[this.status] || 'Unknown';
  }

  /**
   * Get formatted signed date
   */
  getFormattedSignedDate(): string | null {
    if (!this.signed_at) {
      return null;
    }
    return this.signed_at.toISOString();
  }

  /**
   * Check if signer is ready to sign in sequential workflow
   * This requires checking if all previous signers have signed
   */
  static canSignInSequence(currentSigner: Signer, allSigners: Signer[]): boolean {
    // If no signing order, not a sequential workflow
    if (currentSigner.signing_order === null) {
      return true;
    }

    // Check if all previous signers have signed
    const previousSigners = allSigners.filter(
      (s) => s.signing_order !== null && s.signing_order < currentSigner.signing_order!,
    );

    return previousSigners.every((s) => s.hasSigned());
  }

  /**
   * Check if reminder can be sent (not exceeding rate limit)
   * Max 5 reminders per 24 hours
   */
  canResendReminder(): { canResend: boolean; reason?: string } {
    const RESEND_LIMIT = 5;
    const RESEND_WINDOW = 24 * 60 * 60 * 1000; // 24 hours in ms

    // If less than limit, allow
    if (this.reminder_count < RESEND_LIMIT) {
      return { canResend: true };
    }

    // If at limit, check if 24 hours have passed
    if (this.last_reminder_sent_at) {
      const now = new Date();
      const timeSinceLastSend = now.getTime() - this.last_reminder_sent_at.getTime();

      if (timeSinceLastSend >= RESEND_WINDOW) {
        // 24 hours passed, can reset and resend
        return { canResend: true };
      }

      return {
        canResend: false,
        reason:
          'Maximum resend limit reached. Please wait 24 hours before resending to this signer.',
      };
    }

    // Has count but no timestamp (shouldn't happen), allow resend
    return { canResend: true };
  }

  /**
   * Reset reminder count if 24 hours have passed since last reminder
   */
  resetReminderCountIfExpired(): void {
    const RESEND_WINDOW = 24 * 60 * 60 * 1000; // 24 hours in ms

    if (this.last_reminder_sent_at && this.reminder_count >= 5) {
      const now = new Date();
      const timeSinceLastSend = now.getTime() - this.last_reminder_sent_at.getTime();

      if (timeSinceLastSend >= RESEND_WINDOW) {
        this.reminder_count = 0;
      }
    }
  }

  /**
   * Convert to JSON
   */
  toJSON(): SignerData {
    return {
      id: this.id,
      document_id: this.document_id,
      email: this.email,
      name: this.name,
      signing_order: this.signing_order,
      status: this.status,
      access_token: this.access_token,
      signed_at: this.signed_at,
      ip_address: this.ip_address,
      user_agent: this.user_agent,
      last_reminder_sent_at: this.last_reminder_sent_at,
      reminder_count: this.reminder_count,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  /**
   * Convert to public JSON (exclude access token)
   */
  toPublicJSON(): Omit<SignerData, 'access_token'> {
    return {
      id: this.id,
      document_id: this.document_id,
      email: this.email,
      name: this.name,
      signing_order: this.signing_order,
      status: this.status,
      signed_at: this.signed_at,
      ip_address: this.ip_address,
      user_agent: this.user_agent,
      last_reminder_sent_at: this.last_reminder_sent_at,
      reminder_count: this.reminder_count,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}
