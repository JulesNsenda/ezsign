import apiClient from '@/api/client';

/**
 * Instance settings service
 * Handles admin-only instance-wide operational settings (SMTP, from-address,
 * app URL) via GET/PUT /admin/settings and POST /admin/settings/test-email.
 *
 * Response envelope is `{ success, data }` (see
 * backend/src/controllers/adminSettingsController.ts) - unlike
 * `brandingService`, whose endpoints return the payload unwrapped.
 */

export type SettingValueType = 'string' | 'number' | 'boolean';
export type SettingSource = 'db' | 'env' | 'default';

/** Keys defined in backend/src/services/settingsService.ts SETTINGS_REGISTRY. */
export type InstanceSettingKey =
  | 'smtp.host'
  | 'smtp.port'
  | 'smtp.secure'
  | 'smtp.user'
  | 'smtp.pass'
  | 'email.from'
  | 'app.url';

export interface EffectiveSetting {
  key: InstanceSettingKey;
  type: SettingValueType;
  isSecret: boolean;
  /** Secrets always report `null` here - see `isSet` instead. */
  value: string | number | boolean | null;
  /** For secrets: whether a usable (non-empty) value is currently configured. */
  isSet: boolean;
  source: SettingSource;
}

/** Read-only deployment facts returned alongside `settings`. */
export interface InstanceSystemInfo {
  storagePath: string;
  redisConfigured: boolean;
  databaseConfigured: boolean;
}

export interface InstanceSettingsData {
  settings: EffectiveSetting[];
  system: InstanceSystemInfo;
}

export interface SettingEntry {
  key: InstanceSettingKey;
  /** `null` clears the stored value, reverting to env/default. */
  value: string | number | boolean | null;
}

export interface TestEmailResult {
  message: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export const instanceSettingsService = {
  /**
   * Get every known instance setting (effective value/source) plus read-only
   * system info.
   */
  async getSettings(): Promise<InstanceSettingsData> {
    const response = await apiClient.get<ApiEnvelope<InstanceSettingsData>>('/admin/settings');
    return response.data.data;
  },

  /**
   * Update one or more settings. Returns the fresh settings list.
   */
  async updateSettings(entries: SettingEntry[]): Promise<InstanceSettingsData> {
    const response = await apiClient.put<ApiEnvelope<InstanceSettingsData>>('/admin/settings', {
      settings: entries,
    });
    return response.data.data;
  },

  /**
   * Sends a test email to the calling admin's own address using the current
   * effective SMTP config.
   */
  async sendTestEmail(): Promise<TestEmailResult> {
    const response = await apiClient.post<ApiEnvelope<TestEmailResult>>(
      '/admin/settings/test-email',
    );
    return response.data.data;
  },

  /**
   * Find a setting by key in a settings list.
   */
  findSetting(settings: EffectiveSetting[], key: InstanceSettingKey): EffectiveSetting | undefined {
    return settings.find((s) => s.key === key);
  },

  /**
   * Validate a port number (1-65535), matching `smtp.port`'s backend schema.
   */
  isValidPort(port: number): boolean {
    return Number.isInteger(port) && port >= 1 && port <= 65535;
  },

  /**
   * Validate `app.url`: must parse as an absolute URL and use https://,
   * except localhost/127.0.0.1 where http:// is also allowed. Mirrors
   * `appUrlSchema` in backend/src/services/settingsService.ts.
   */
  isValidAppUrl(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    return parsed.protocol === 'https:' || (isLocalHost && parsed.protocol === 'http:');
  },
};

export default instanceSettingsService;
