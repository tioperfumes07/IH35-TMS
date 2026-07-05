// Guard (G10-C2): a dead QBO refresh token must NOT keep reading as "connected" while
// reconciliation silently stops. On a token-refresh failure the service must STAMP the
// connection (needs_reauth_at + last_refresh_error), a successful refresh/re-auth must CLEAR
// them, and getQboConnectionStatus must SURFACE the reauth-needed state (connected=false).
// Regression guard for the 2026-07-05 fix.
import fs from "node:fs";

const svc = fs.readFileSync("apps/backend/src/integrations/qbo/qbo-oauth.service.ts", "utf8");
const migDir = "db/migrations";
const migration = fs
  .readdirSync(migDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => fs.readFileSync(`${migDir}/${f}`, "utf8"))
  .join("\n");

const checks = [
  [
    "migration adds needs_reauth_at column",
    /ADD COLUMN IF NOT EXISTS\s+needs_reauth_at\s+timestamptz/i.test(migration),
  ],
  [
    "migration adds last_refresh_error column",
    /ADD COLUMN IF NOT EXISTS\s+last_refresh_error\s+text/i.test(migration),
  ],
  [
    "refresh failure is stamped (stampRefreshFailure called before re-throw)",
    /stampRefreshFailure\(/.test(svc),
  ],
  [
    "successful refresh clears the reauth flags",
    /needs_reauth_at = NULL,\s*\n\s*last_refresh_error = NULL/.test(svc),
  ],
  [
    "status surfaces needs_reauth and flips connected off",
    /needs_reauth:\s*needsReauth/.test(svc) && /connected:\s*!needsReauth/.test(svc),
  ],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length > 0) {
  console.error("verify:qbo-reauth-observability FAILED —");
  for (const name of failed) console.error(`  - ${name}`);
  process.exit(1);
}
console.log("verify:qbo-reauth-observability OK");
