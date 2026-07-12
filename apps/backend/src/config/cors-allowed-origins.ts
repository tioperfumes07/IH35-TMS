/**
 * Single source of truth for the CORS / CSRF-origin allow-list.
 *
 * 0243-h1-2 (fix): the code-default list previously (a) OMITTED the real prod frontend origin
 * `https://app.ih35dispatch.com` in the index.ts copy while this file diverged, (b) always baked in
 * `localhost` even in production, and (c) silently fell back to a dev list when `CORS_ALLOWED_ORIGINS`
 * was unset — so correctness hinged entirely on an unversioned Render env var. Now: the prod origins are
 * the versioned default, localhost is dev-only, and an unset env var in production FAILS LOUD (refuses to
 * boot / 500s the origin check) instead of silently degrading.
 */

/** Real production browser/API origins — always allowed, versioned in code (not just the env var). */
const PROD_ORIGINS = [
  "https://app.ih35dispatch.com",
  "https://api.ih35dispatch.com",
  "https://ih35-tms-web.onrender.com",
  "https://ih35-tms-driver.onrender.com",
];

/** Local dev origins — allowed only when NOT running in production. */
const DEV_ORIGINS = ["http://localhost:5173", "http://localhost:5174"];

/** Parses CORS_ALLOWED_ORIGINS. Prod origins are the versioned default; localhost is dev-only. */
export function getCorsAllowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  if (raw && raw.trim()) {
    return raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  // No explicit override configured.
  if (process.env.NODE_ENV === "production") {
    // 0243-h1-2: never silently serve a dev/localhost CORS list in production. Fail loud so the
    // misconfiguration is caught at boot / first request instead of quietly weakening the boundary.
    throw new Error(
      "CORS_ALLOWED_ORIGINS must be set in production — refusing to fall back to the dev/localhost default."
    );
  }
  return [...PROD_ORIGINS, ...DEV_ORIGINS];
}
