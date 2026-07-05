-- G10-C2: surface a dead QBO refresh token instead of silently showing "connected".
-- When an hourly token refresh (or on-demand getValidAccessToken) fails because the
-- refresh token is dead/expired (Intuit invalid_grant), reconciliation silently stops
-- while the UI keeps rendering "connected". These two additive, nullable columns let the
-- backend STAMP the failure and the status endpoint SURFACE a "needs re-authorization"
-- state. Pure connection observability — NO posting/GL/ledger behavior. Additive-only,
-- idempotent, no data change, existing table-level grants already cover new columns.

BEGIN;

ALTER TABLE integrations.qbo_connections
  ADD COLUMN IF NOT EXISTS needs_reauth_at timestamptz;

ALTER TABLE integrations.qbo_connections
  ADD COLUMN IF NOT EXISTS last_refresh_error text;

COMMENT ON COLUMN integrations.qbo_connections.needs_reauth_at IS
  'Set when a token refresh fails with an auth error (dead/expired refresh token, Intuit invalid_grant). Cleared on a successful refresh or re-authorization. Non-NULL => connection needs re-auth; status endpoint reports connected=false.';
COMMENT ON COLUMN integrations.qbo_connections.last_refresh_error IS
  'Sanitized (token-redacted) summary of the most recent token-refresh failure, for operator diagnostics. Cleared on a successful refresh or re-authorization.';

COMMIT;
