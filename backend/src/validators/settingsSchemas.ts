import { z } from 'zod';
import { SETTINGS_REGISTRY } from '@/services/settingsService';

/**
 * Reuses the settings registry (single source of truth, defined in
 * `settingsService.ts`) so the set of valid keys can't drift between the
 * service and this schema.
 */
const registryKeys = Object.keys(SETTINGS_REGISTRY);
const knownSettingKey = z.string().refine((key) => registryKeys.includes(key), {
  message: 'Unknown setting key',
});

/**
 * A single entry in the PUT body. Per-key type/format refinements (port
 * range, app.url scheme, etc.) are intentionally not duplicated here -
 * `SettingsService.set()` is the authoritative validator for those and
 * already reuses each key's registry schema; this layer only validates the
 * request envelope shape.
 */
export const settingEntrySchema = z.object({
  key: knownSettingKey,
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

/**
 * PUT /api/admin/settings body schema.
 */
export const putSettingsSchema = z.object({
  settings: z
    .array(settingEntrySchema)
    .min(1, 'At least one setting is required')
    .max(20, 'A maximum of 20 settings can be updated in a single request')
    .refine((settings) => new Set(settings.map((s) => s.key)).size === settings.length, {
      message: 'Duplicate setting keys are not allowed in a single request',
    }),
});

export type PutSettingsBody = z.infer<typeof putSettingsSchema>;
