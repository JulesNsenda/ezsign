import React, { useEffect, useMemo, useState } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { useToast } from '@/hooks/useToast';
import {
  useInstanceSettings,
  useUpdateInstanceSettings,
  useSendTestEmail,
} from '@/hooks/useInstanceSettings';
import instanceSettingsService, {
  type EffectiveSetting,
  type InstanceSettingKey,
  type SettingEntry,
  type SettingSource,
} from '@/services/instanceSettingsService';

/**
 * Instance settings component (admin-only) - SMTP, from-address, and
 * application URL, stored in Postgres and resolved DB -> env -> default.
 * Follows the BrandingSettings pattern: plain useState form + toasts,
 * PUT only the keys the admin actually changed.
 */

interface FormState {
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  /** Write-only: never populated from the server. Empty = "leave unchanged". */
  smtpPass: string;
  emailFrom: string;
  appUrl: string;
  registrationEnabled: boolean;
}

const EMPTY_FORM: FormState = {
  smtpHost: '',
  smtpPort: '',
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  emailFrom: '',
  appUrl: '',
  registrationEnabled: false,
};

const SOURCE_LABELS: Record<SettingSource, string> = {
  db: 'DB',
  env: 'ENV',
  default: 'DEFAULT',
};

const SOURCE_BADGE_CLASSES: Record<SettingSource, string> = {
  db: 'badge-primary',
  env: 'badge-secondary',
  default: 'badge-ghost',
};

const SourceBadge: React.FC<{ source: SettingSource }> = ({ source }) => (
  <span className={`badge badge-sm ${SOURCE_BADGE_CLASSES[source]}`}>{SOURCE_LABELS[source]}</span>
);

const find = (settings: EffectiveSetting[], key: InstanceSettingKey) =>
  instanceSettingsService.findSetting(settings, key);

export const InstanceSettings: React.FC = () => {
  const toast = useToast();

  const { data, isLoading, error } = useInstanceSettings();
  const updateSettings = useUpdateInstanceSettings();
  const sendTestEmail = useSendTestEmail();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Initialize/re-sync form state whenever fresh settings load (including
  // after a successful save, since the mutation invalidates this query).
  useEffect(() => {
    if (!data) return;
    setForm({
      smtpHost: String(find(data.settings, 'smtp.host')?.value ?? ''),
      smtpPort:
        find(data.settings, 'smtp.port')?.value != null
          ? String(find(data.settings, 'smtp.port')?.value)
          : '',
      smtpSecure: Boolean(find(data.settings, 'smtp.secure')?.value ?? false),
      smtpUser: String(find(data.settings, 'smtp.user')?.value ?? ''),
      smtpPass: '',
      emailFrom: String(find(data.settings, 'email.from')?.value ?? ''),
      appUrl: String(find(data.settings, 'app.url')?.value ?? ''),
      registrationEnabled: Boolean(find(data.settings, 'registration.enabled')?.value ?? false),
    });
  }, [data]);

  const handleChange = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Diff against the last-loaded settings to build a PUT payload containing
  // only the keys that actually changed.
  const changedEntries = useMemo<SettingEntry[]>(() => {
    if (!data) return [];
    const entries: SettingEntry[] = [];

    const origHost = String(find(data.settings, 'smtp.host')?.value ?? '');
    if (form.smtpHost !== origHost) entries.push({ key: 'smtp.host', value: form.smtpHost });

    const origPort = find(data.settings, 'smtp.port')?.value;
    const portNum = form.smtpPort === '' ? NaN : Number(form.smtpPort);
    if (!Number.isNaN(portNum) && portNum !== origPort) {
      entries.push({ key: 'smtp.port', value: portNum });
    }

    const origSecure = Boolean(find(data.settings, 'smtp.secure')?.value ?? false);
    if (form.smtpSecure !== origSecure)
      entries.push({ key: 'smtp.secure', value: form.smtpSecure });

    const origUser = String(find(data.settings, 'smtp.user')?.value ?? '');
    if (form.smtpUser !== origUser) entries.push({ key: 'smtp.user', value: form.smtpUser });

    // Only send the password when the admin actually typed one.
    if (form.smtpPass !== '') entries.push({ key: 'smtp.pass', value: form.smtpPass });

    const origFrom = String(find(data.settings, 'email.from')?.value ?? '');
    if (form.emailFrom !== origFrom) entries.push({ key: 'email.from', value: form.emailFrom });

    const origAppUrl = String(find(data.settings, 'app.url')?.value ?? '');
    if (form.appUrl !== origAppUrl) entries.push({ key: 'app.url', value: form.appUrl });

    const origRegistrationEnabled = Boolean(
      find(data.settings, 'registration.enabled')?.value ?? false,
    );
    if (form.registrationEnabled !== origRegistrationEnabled) {
      entries.push({ key: 'registration.enabled', value: form.registrationEnabled });
    }

    return entries;
  }, [data, form]);

  const hasUnsavedChanges = changedEntries.length > 0;

  // The backend clears the effective `smtp.pass` value whenever host/port/
  // secure change and the request doesn't also set a new password - it
  // writes an explicit "unset" tombstone rather than just deleting the DB
  // row, precisely so a password sourced from EMAIL_SMTP_PASS can't keep
  // being used against the new host either. So this note applies regardless
  // of the password's current source (db or env), not just db.
  const passSetting = data ? find(data.settings, 'smtp.pass') : undefined;
  const transportChanged = changedEntries.some(
    (e) => e.key === 'smtp.host' || e.key === 'smtp.port' || e.key === 'smtp.secure',
  );
  const showPassClearNote = transportChanged && form.smtpPass === '' && passSetting?.isSet;

  const handleSave = async () => {
    if (changedEntries.length === 0) {
      return;
    }

    // Only validate a field if it's actually part of this save - an
    // env-sourced value (e.g. app.url) can load into the form without
    // passing its own client-side check (resolveFromEnv coerces type but
    // never runs the zod schema), which would otherwise block saving an
    // unrelated change - like the registration.enabled toggle below - forever.
    const changedKeys = new Set(changedEntries.map((e) => e.key));

    if (changedKeys.has('smtp.host') && !form.smtpHost.trim()) {
      toast.error('SMTP host cannot be empty');
      return;
    }
    const portNum = Number(form.smtpPort);
    if (
      changedKeys.has('smtp.port') &&
      (form.smtpPort === '' || !instanceSettingsService.isValidPort(portNum))
    ) {
      toast.error('SMTP port must be between 1 and 65535');
      return;
    }
    if (changedKeys.has('email.from') && !form.emailFrom.trim()) {
      toast.error('From address cannot be empty');
      return;
    }
    if (
      changedKeys.has('app.url') &&
      (!form.appUrl.trim() || !instanceSettingsService.isValidAppUrl(form.appUrl.trim()))
    ) {
      toast.error(
        'Application URL must be a valid https:// URL (http:// is only allowed for localhost)',
      );
      return;
    }

    try {
      await updateSettings.mutateAsync(changedEntries);
      toast.success('Instance settings saved successfully');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to save instance settings');
    }
  };

  const handleSendTestEmail = async () => {
    try {
      const result = await sendTestEmail.mutateAsync();
      toast.success(result.message || 'Test email sent');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to send test email');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <div className="text-center py-8">
          <p className="text-error">Failed to load instance settings</p>
          <Button variant="outline" onClick={() => window.location.reload()} className="mt-4">
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  const hostSetting = find(data.settings, 'smtp.host');
  const portSetting = find(data.settings, 'smtp.port');
  const secureSetting = find(data.settings, 'smtp.secure');
  const userSetting = find(data.settings, 'smtp.user');
  const fromSetting = find(data.settings, 'email.from');
  const appUrlSetting = find(data.settings, 'app.url');
  const registrationEnabledSetting = find(data.settings, 'registration.enabled');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-neutral">Instance Settings</h2>
          <p className="text-sm text-base-content/60 mt-1">
            Configure instance-wide email delivery and application settings
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSendTestEmail}
            disabled={hasUnsavedChanges || sendTestEmail.isPending}
            loading={sendTestEmail.isPending}
            title={hasUnsavedChanges ? 'Save changes before sending a test email' : undefined}
          >
            Send Test Email
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasUnsavedChanges || updateSettings.isPending}
            loading={updateSettings.isPending}
          >
            Save Changes
          </Button>
        </div>
      </div>

      {/* Email (SMTP) Section */}
      <Card title="Email (SMTP)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">SMTP Host</label>
              {hostSetting && <SourceBadge source={hostSetting.source} />}
            </div>
            <input
              type="text"
              value={form.smtpHost}
              onChange={(e) => handleChange('smtpHost', e.target.value)}
              placeholder="smtp.example.com"
              className="input input-bordered w-full"
              maxLength={255}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">SMTP Port</label>
              {portSetting && <SourceBadge source={portSetting.source} />}
            </div>
            <input
              type="number"
              value={form.smtpPort}
              onChange={(e) => handleChange('smtpPort', e.target.value)}
              placeholder="587"
              min={1}
              max={65535}
              className="input input-bordered w-full"
            />
          </div>

          <div className="md:col-span-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.smtpSecure}
                  onChange={(e) => handleChange('smtpSecure', e.target.checked)}
                  className="toggle toggle-primary"
                />
                <span className="font-medium">Use TLS/SSL (secure)</span>
              </label>
              {secureSetting && <SourceBadge source={secureSetting.source} />}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">SMTP Username</label>
              {userSetting && <SourceBadge source={userSetting.source} />}
            </div>
            <input
              type="text"
              value={form.smtpUser}
              onChange={(e) => handleChange('smtpUser', e.target.value)}
              placeholder="username"
              className="input input-bordered w-full"
              maxLength={255}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">SMTP Password</label>
              {passSetting && <SourceBadge source={passSetting.source} />}
            </div>
            <input
              type="password"
              value={form.smtpPass}
              onChange={(e) => handleChange('smtpPass', e.target.value)}
              placeholder={passSetting?.isSet ? '•••••••• (configured)' : 'Not set'}
              className="input input-bordered w-full"
              autoComplete="new-password"
              maxLength={500}
            />
            {showPassClearNote && (
              <p className="text-xs text-warning mt-1">
                Changing the SMTP server clears the saved password — re-enter it.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Sending Section */}
      <Card title="Sending">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium">From Address</label>
            {fromSetting && <SourceBadge source={fromSetting.source} />}
          </div>
          <input
            type="text"
            value={form.emailFrom}
            onChange={(e) => handleChange('emailFrom', e.target.value)}
            placeholder="noreply@yourcompany.com"
            className="input input-bordered w-full max-w-md"
            maxLength={255}
          />
          <p className="text-xs text-base-content/50 mt-1">
            Used as the "From" address on outgoing emails
          </p>
        </div>
      </Card>

      {/* Application Section */}
      <Card title="Application">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium">Application URL</label>
            {appUrlSetting && <SourceBadge source={appUrlSetting.source} />}
          </div>
          <input
            type="url"
            value={form.appUrl}
            onChange={(e) => handleChange('appUrl', e.target.value)}
            placeholder="https://ezsign.yourcompany.com"
            className="input input-bordered w-full max-w-md"
          />
          <p className="text-xs text-base-content/50 mt-1">
            Used to build signing/download links in emails. Must be https:// (http:// is only
            allowed for localhost).
          </p>
        </div>
      </Card>

      {/* Registration Section */}
      <Card title="Registration">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.registrationEnabled}
              onChange={(e) => handleChange('registrationEnabled', e.target.checked)}
              className="toggle toggle-primary"
            />
            <span className="font-medium">Allow self-service sign-up</span>
          </label>
          {registrationEnabledSetting && <SourceBadge source={registrationEnabledSetting.source} />}
        </div>
        <p className="text-xs text-base-content/50 mt-1">
          Closed by default. When off, the public sign-up page is disabled and only invited
          teammates can create an account. Admins can always be created via the invitation flow.
        </p>
      </Card>

      {/* System Section (read-only) */}
      <Card title="System" subtitle="Read-only deployment information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-medium text-base-content/70">Storage Path</p>
            <p className="text-sm mt-1 font-mono break-all">{data.system.storagePath}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-base-content/70">Database</p>
            <p
              className={`text-sm mt-1 font-medium ${data.system.databaseConfigured ? 'text-success' : 'text-warning'}`}
            >
              {data.system.databaseConfigured ? 'Configured' : 'Not configured'}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default InstanceSettings;
