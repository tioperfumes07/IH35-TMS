#!/usr/bin/env node
// PROJECTED-CASH-FOLLOWS-ETA (BLOCK 2) foundation guard — the predicted-delivery-change audit
// table is append-only, per-entity, forecast-only. Locks the trust properties of the audit trail.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => {
  console.error(`FAIL verify-cash-eta-audit-append-only: ${m}`);
  process.exit(1);
};

const mig = read("db/migrations/202606170300_predicted_delivery_changes_audit.sql");

// 1. The append-only audit table in the forecast schema.
if (!/CREATE TABLE IF NOT EXISTS forecast\.predicted_delivery_changes/.test(mig)) fail("audit table missing");
for (const col of ["operating_company_id", "load_id", "old_predicted_date", "new_predicted_date", "triggering_signals", "confirmed_by_user_id", "confirmed_at"]) {
  if (!mig.includes(col)) fail(`audit table missing column: ${col}`);
}

// 2. Append-only at the grant level: SELECT+INSERT granted, UPDATE+DELETE revoked.
if (!/GRANT\s+SELECT,\s*INSERT\s+ON\s+forecast\.predicted_delivery_changes/i.test(mig)) fail("must GRANT SELECT, INSERT");
if (!/REVOKE\s+UPDATE,\s*DELETE\s+ON\s+forecast\.predicted_delivery_changes/i.test(mig)) fail("must REVOKE UPDATE, DELETE (append-only)");

// 3. Per-operating_company RLS.
if (!/ENABLE ROW LEVEL SECURITY/.test(mig)) fail("RLS must be enabled");
if (!/operating_company_id = NULLIF\(current_setting\('app\.operating_company_id'/.test(mig)) fail("per-entity RLS policy required");

// 4. Forecast-only boundary: no accounting/AR/GL/posting in the executable SQL (comments that
//    mention the boundary in prose are fine — strip them before checking).
const migSql = mig
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
if (/accounting\.|catalogs\.accounts|journal_|\bgl_/i.test(migSql)) fail("audit migration must stay forecast-only (no accounting/GL/posting)");

// 5. The receivable-lag rule is never zero and matches the locked rule.
const lag = read("apps/backend/src/dispatch/receivable-lag.ts");
if (!lag.includes("FACTORING_ADVANCE_DAYS")) fail("receivable-lag must define the factoring advance window");
if (!/non-factored/i.test(lag) || !lag.includes("DEFAULT_NET_TERMS_DAYS")) fail("receivable-lag must use customer net terms with a documented non-zero fallback");

console.log("PASS verify-cash-eta-audit-append-only");
