// Empty string = relative URL (same origin). The Next.js rewrite proxy in
// next.config.ts forwards /api/v1/* to the actual backend, so the browser
// never needs to know the backend's address directly.
export const API_BASE_URL = ''
export const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:8000'
export const LOCALSTORAGE_SESSION_ID = 'session_id'
export const LOCALSTORAGE_VOTED_PREFIX = 'voted:'
export const MIN_MESSAGES_FOR_SHAME = 2
