// ---------------------------------------------------------------------------
// Application-wide constants
// Centralises all magic strings and configuration values.
// Import from here instead of hardcoding literals across components/services.
// ---------------------------------------------------------------------------

export const STORAGE_KEYS = {
  /** localStorage key for the list of saved events */
  EVENTS: 'stack_connect_events',
  /** localStorage key for the dummy auth state */
  AUTH_STATE: 'dummy_auth_state',
  /** sessionStorage key that grants access to an event's dashboard */
  accessKey: (eventId: string) => `access_${eventId}`,
  /** sessionStorage flag set when navigating from the landing page */
  FROM_LANDING: 'from_landing',
  /** localStorage key for pending (unsynced) write payloads */
  PENDING_SYNCS: 'stack_connect_pending_syncs',
} as const;

export const SYNC_CONFIG = {
  /** Auto-refresh interval for the dashboard (ms) */
  AUTO_SYNC_INTERVAL_MS: 60_000,
  /** Timeout for fire-with-fallback backend sync calls (ms) */
  BACKEND_TIMEOUT_MS: 5_000,
  /** Maximum number of times a failed sync will be re-queued */
  MAX_PENDING_RETRIES: 3,
  /** How often the role-selection page re-fetches event data to pick up SPOC changes (ms) */
  EVENT_REFRESH_INTERVAL_MS: 15 * 60 * 1000,
} as const;

export const VALIDATION = {
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  /** Must start with + and contain 7–20 digits/separators */
  PHONE_REGEX: /^\+[0-9\s\-().]{6,19}$/,
  /** Substrings that identify personal / non-corporate email domains */
  PERSONAL_EMAIL_DOMAINS: ['@gmail.', '@yahoo.', '@zohomail.', '@hotmail.', '@outlook.'],
} as const;

export const DEFAULT_LANYARD_COLOR = 'Yellow';

export const LANYARD_COLORS_FALLBACK = [
  'Green',
  'Yellow',
  'Crimson Red',
  'Charcoal Grey',
  'Red',
] as const;
