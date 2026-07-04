// Guard: the QBO "disconnected" watchdog must only alert companies that HAVE a live qbo_connections
// row. A parallel-books / future entity that never linked QBO (e.g. USMCA) is not "disconnected" —
// without this scope it emails a re-auth reminder every 15 min forever (the in-memory cooldown resets
// on every deploy). Regression guard for 2026-07-04 fix.
import fs from "node:fs";
const f = "apps/backend/src/cron/qbo-token-refresh.ts";
const s = fs.readFileSync(f, "utf8");
const ok =
  /listQboWatchdogCompanyIds/.test(s) &&
  /FROM integrations\.qbo_connections/.test(s) &&
  /revoked_at IS NULL/.test(s) &&
  !/const activeCompanyIds = await listActiveCompanyIds\(\)/.test(s);
if (!ok) {
  console.error("verify:qbo-watchdog-scoped FAILED — watchdog must scope to companies with a live qbo_connections row (see qbo-token-refresh.ts)");
  process.exit(1);
}
console.log("verify:qbo-watchdog-scoped OK");
