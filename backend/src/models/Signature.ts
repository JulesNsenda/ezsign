export type SignatureType = 'drawn' | 'typed' | 'uploaded';

export interface SignatureData {
  id: string;
  signer_id: string;
  field_id: string;
  signature_type: SignatureType;
  signature_data: string;
  text_value: string | null;
  font_family: string | null;
  ip_address: string | null;
  user_agent: string | null;
  signed_at: Date;
  created_at: Date;
}

export interface CreateSignatureData {
  signer_id: string;
  field_id: string;
  signature_type: SignatureType;
  signature_data: string;
  text_value?: string | null;
  font_family?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

export class Signature {
  id: string;
  signer_id: string;
  field_id: string;
  signature_type: SignatureType;
  signature_data: string;
  text_value: string | null;
  font_family: string | null;
  ip_address: string | null;
  user_agent: string | null;
  signed_at: Date;
  created_at: Date;

  constructor(data: SignatureData) {
    this.id = data.id;
    this.signer_id = data.signer_id;
    this.field_id = data.field_id;
    this.signature_type = data.signature_type;
    this.signature_data = data.signature_data;
    this.text_value = data.text_value;
    this.font_family = data.font_family;
    this.ip_address = data.ip_address;
    this.user_agent = data.user_agent;
    this.signed_at = data.signed_at;
    this.created_at = data.created_at;
  }

  /**
   * Check if signature is drawn type
   */
  isDrawn(): boolean {
    return this.signature_type === 'drawn';
  }

  /**
   * Check if signature is typed type
   */
  isTyped(): boolean {
    return this.signature_type === 'typed';
  }

  /**
   * Check if signature is uploaded type
   */
  isUploaded(): boolean {
    return this.signature_type === 'uploaded';
  }

  /**
   * Validate signature type
   */
  static isValidSignatureType(type: string): type is SignatureType {
    return ['drawn', 'typed', 'uploaded'].includes(type);
  }

  /**
   * Validate signature data format (base64 for images)
   */
  static isValidBase64Image(data: string): boolean {
    // Check if it's a data URL with base64 image
    const base64ImageRegex = /^data:image\/(png|jpeg|jpg|gif|webp);base64,/;
    if (base64ImageRegex.test(data)) {
      return true;
    }

    // Check if it's pure base64 (without data URL prefix)
    const pureBase64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    return pureBase64Regex.test(data) && data.length > 0;
  }

  /**
   * Validate typed signature text
   */
  static isValidTypedText(text: string): boolean {
    return text.trim().length > 0 && text.length <= 500;
  }

  /**
   * Validate signature data based on type
   */
  validateSignatureData(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!Signature.isValidSignatureType(this.signature_type)) {
      errors.push(`Invalid signature type: ${this.signature_type}`);
    }

    switch (this.signature_type) {
      case 'drawn':
      case 'uploaded':
        if (!Signature.isValidBase64Image(this.signature_data)) {
          errors.push('Signature data must be a valid base64 encoded image');
        }
        break;

      case 'typed':
        if (!this.text_value || !Signature.isValidTypedText(this.text_value)) {
          errors.push('Typed signature must have valid text (1-500 characters)');
        }
        if (this.font_family && this.font_family.length > 100) {
          errors.push('Font family name too long (max 100 characters)');
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get signature description for display
   */
  getDescription(): string {
    switch (this.signature_type) {
      case 'drawn':
        return 'Hand-drawn signature';
      case 'typed':
        return `Typed signature: ${this.text_value || 'N/A'}`;
      case 'uploaded':
        return 'Uploaded signature image';
      default:
        return 'Unknown signature type';
    }
  }

  /**
   * Get signature metadata
   */
  getMetadata(): {
    ip_address: string | null;
    user_agent: string | null;
    signed_at: Date;
  } {
    return {
      ip_address: this.ip_address,
      user_agent: this.user_agent,
      signed_at: this.signed_at,
    };
  }

  /**
   * Convert to JSON
   */
  toJSON(): SignatureData {
    return {
      id: this.id,
      signer_id: this.signer_id,
      field_id: this.field_id,
      signature_type: this.signature_type,
      signature_data: this.signature_data,
      text_value: this.text_value,
      font_family: this.font_family,
      ip_address: this.ip_address,
      user_agent: this.user_agent,
      signed_at: this.signed_at,
      created_at: this.created_at,
    };
  }

  /**
   * Convert to public JSON (exclude sensitive data)
   */
  toPublicJSON(): Omit<SignatureData, 'ip_address' | 'user_agent'> {
    return {
      id: this.id,
      signer_id: this.signer_id,
      field_id: this.field_id,
      signature_type: this.signature_type,
      signature_data: this.signature_data,
      text_value: this.text_value,
      font_family: this.font_family,
      signed_at: this.signed_at,
      created_at: this.created_at,
    };
  }
}
