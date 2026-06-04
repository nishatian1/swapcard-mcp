/** Swapcard API endpoints. Auth for all = `Authorization: <api-key>` (raw key, not Bearer). */
export const SWAPCARD_ENDPOINTS = {
  /** Organizer Content API (read + write). Primary surface. */
  eventAdmin: "https://developer.swapcard.com/event-admin/graphql",
  /** Exhibitor / Leads API (needs an exhibitor-scoped token). Phase 6. */
  exhibitor: "https://developer.swapcard.com/exhibitor/graphql",
  /** Analytics export (newline-delimited JSON stream). */
  analytics: "https://developer.swapcard.com/event-admin/export/analytics",
} as const;
