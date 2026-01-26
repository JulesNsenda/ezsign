/**
 * Embedded Signing PostMessage API Service
 *
 * This service handles communication between the embedded signing page
 * and the parent application via PostMessage API.
 */

// Event types sent from EzSign to parent
export type EzSignEventType =
  | 'ezsign:ready'
  | 'ezsign:signed'
  | 'ezsign:declined'
  | 'ezsign:error'
  | 'ezsign:pageChange'
  | 'ezsign:fieldFocused'
  | 'ezsign:progress';

// Command types received from parent
export type EzSignCommandType =
  | 'ezsign:getStatus'
  | 'ezsign:scrollToField'
  | 'ezsign:setTheme';

/**
 * Event payload sent to parent
 */
export interface EzSignEvent {
  type: EzSignEventType;
  documentId: string;
  payload: {
    status?: string;
    signerId?: string;
    signerEmail?: string;
    pageNumber?: number;
    totalPages?: number;
    fieldId?: string;
    fieldType?: string;
    progress?: number;
    totalFields?: number;
    completedFields?: number;
    error?: string;
    errorCode?: string;
  };
}

/**
 * Command received from parent
 */
export interface EzSignCommand {
  type: EzSignCommandType;
  payload?: {
    fieldId?: string;
    theme?: 'light' | 'dark';
    primaryColor?: string;
  };
}

/**
 * Command handler callback type
 */
export type CommandHandler = (command: EzSignCommand) => void;

/**
 * Embedded mode configuration parsed from URL
 */
export interface EmbedConfig {
  isEmbedded: boolean;
  allowedOrigin: string | null;
  theme: 'light' | 'dark' | null;
  primaryColor: string | null;
  hideProgress: boolean;
}

/**
 * Parse embed configuration from URL query parameters
 */
export const parseEmbedConfig = (): EmbedConfig => {
  const searchParams = new URLSearchParams(window.location.search);

  return {
    isEmbedded: searchParams.get('embedded') === 'true',
    allowedOrigin: searchParams.get('origin'),
    theme: searchParams.get('theme') as 'light' | 'dark' | null,
    primaryColor: searchParams.get('primaryColor'),
    hideProgress: searchParams.get('hideProgress') === 'true',
  };
};

/**
 * Check if we're running inside an iframe
 */
export const isInIframe = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    // If we can't access window.top due to same-origin policy, we're in an iframe
    return true;
  }
};

/**
 * Validate that we're in a valid embedded context
 */
export const isValidEmbedContext = (config: EmbedConfig): boolean => {
  return config.isEmbedded && isInIframe();
};

/**
 * Send an event to the parent window
 *
 * @param event - The event to send
 * @param origin - The target origin (from embed config)
 */
export const sendToParent = (event: EzSignEvent, origin: string | null): void => {
  if (!isInIframe()) {
    console.debug('[EzSign Embed] Not in iframe, skipping postMessage');
    return;
  }

  if (!origin) {
    console.debug('[EzSign Embed] No origin specified, skipping postMessage');
    return;
  }

  try {
    window.parent.postMessage(event, origin);
    console.debug('[EzSign Embed] Event sent:', event.type, event.payload);
  } catch (error) {
    console.error('[EzSign Embed] Failed to send postMessage:', error);
  }
};

/**
 * Create event helper functions bound to a specific document and origin
 */
export const createEventEmitter = (documentId: string, origin: string | null) => {
  const emit = (type: EzSignEventType, payload: EzSignEvent['payload'] = {}) => {
    sendToParent({ type, documentId, payload }, origin);
  };

  return {
    /**
     * Emit when the document is loaded and ready
     */
    emitReady: (signerId?: string, signerEmail?: string) => {
      emit('ezsign:ready', { status: 'ready', signerId, signerEmail });
    },

    /**
     * Emit when signing is completed successfully
     */
    emitSigned: (signerId: string) => {
      emit('ezsign:signed', { status: 'signed', signerId });
    },

    /**
     * Emit when signer declines to sign
     */
    emitDeclined: (signerId: string) => {
      emit('ezsign:declined', { status: 'declined', signerId });
    },

    /**
     * Emit when an error occurs
     */
    emitError: (error: string, errorCode?: string) => {
      emit('ezsign:error', { status: 'error', error, errorCode });
    },

    /**
     * Emit when PDF page changes
     */
    emitPageChange: (pageNumber: number, totalPages: number) => {
      emit('ezsign:pageChange', { pageNumber, totalPages });
    },

    /**
     * Emit when a field receives focus
     */
    emitFieldFocused: (fieldId: string, fieldType: string, pageNumber: number) => {
      emit('ezsign:fieldFocused', { fieldId, fieldType, pageNumber });
    },

    /**
     * Emit progress update
     */
    emitProgress: (completedFields: number, totalFields: number) => {
      const progress = totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0;
      emit('ezsign:progress', { progress, completedFields, totalFields });
    },
  };
};

/**
 * Create a message listener for commands from parent
 *
 * @param origin - The allowed origin for messages
 * @param handler - The command handler function
 * @returns Cleanup function to remove the listener
 */
export const createCommandListener = (
  origin: string | null,
  handler: CommandHandler
): (() => void) => {
  const handleMessage = (event: MessageEvent) => {
    // Validate origin
    if (origin && event.origin !== origin) {
      console.debug('[EzSign Embed] Ignoring message from unauthorized origin:', event.origin);
      return;
    }

    // Validate message structure
    const data = event.data;
    if (!data || typeof data !== 'object' || !data.type) {
      return;
    }

    // Check if it's an EzSign command
    if (!data.type.startsWith('ezsign:')) {
      return;
    }

    console.debug('[EzSign Embed] Command received:', data.type, data.payload);
    handler(data as EzSignCommand);
  };

  window.addEventListener('message', handleMessage);

  // Return cleanup function
  return () => {
    window.removeEventListener('message', handleMessage);
  };
};

/**
 * Apply custom primary color from embed config
 */
export const applyEmbedTheme = (config: EmbedConfig): void => {
  // Apply primary color
  if (config.primaryColor) {
    // Validate hex color format
    const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (hexPattern.test(config.primaryColor)) {
      document.documentElement.style.setProperty('--embed-primary', config.primaryColor);
      // Also set DaisyUI primary color variable
      document.documentElement.style.setProperty('--p', hexToHsl(config.primaryColor));
    }
  }

  // Apply theme
  if (config.theme) {
    document.documentElement.setAttribute('data-theme', config.theme);
  }
};

/**
 * Convert hex color to HSL string (for DaisyUI)
 * Returns HSL values without the "hsl()" wrapper
 */
const hexToHsl = (hex: string): string => {
  // Remove # if present
  hex = hex.replace('#', '');

  // Parse hex
  let r = parseInt(hex.substring(0, 2), 16) / 255;
  let g = parseInt(hex.substring(2, 4), 16) / 255;
  let b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  // Return as DaisyUI format: "H S% L%"
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

export default {
  parseEmbedConfig,
  isInIframe,
  isValidEmbedContext,
  sendToParent,
  createEventEmitter,
  createCommandListener,
  applyEmbedTheme,
};
