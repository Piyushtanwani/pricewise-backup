/** Keys mirror the toggles on frontend/src/pages/Settings.tsx (Notifications tab). */
export const DEFAULT_NOTIFICATION_PREFS = {
  priceDropEmail: true,
  priceDropInApp: true,
  priceDropPush: false,
  targetEmail: true,
  targetInApp: true,
  recommendationsInApp: true,
  weeklyDigest: false,
};

export type NotificationPrefs = typeof DEFAULT_NOTIFICATION_PREFS;
export type NotificationPrefKey = keyof NotificationPrefs;

export const PREF_KEYS = Object.keys(DEFAULT_NOTIFICATION_PREFS) as NotificationPrefKey[];

export const readPrefs = (stored: unknown): NotificationPrefs => {
  const prefs = { ...DEFAULT_NOTIFICATION_PREFS };
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const key of PREF_KEYS) {
      const value = (stored as Record<string, unknown>)[key];
      if (typeof value === 'boolean') prefs[key] = value;
    }
  }
  return prefs;
};
