#!/usr/bin/env node
/**
 * Wave-3 flag-gate guard — PREPAID_EXPENSES_POST_ENABLED (UI-1 prepaid-expenses create route).
 *
 * Ground truth (verified in the source): create-time GL posting for prepaid assets is NOT yet
 * implemented. The prepaid create route (prepaid-expenses.routes.ts) writes ONLY the asset header +
 * amortization schedule rows (accounting.prepaid_assets / accounting.prepaid_amortization_rows) — it
 * posts NO journal entry. The flag PREPAID_EXPENSES_POST_ENABLED is the kill switch for that future
 * posting path; while it is OFF the route creates the (unposted) asset, and if it is ever turned ON it
 * HARD-REFUSES (422 gl_posting_not_implemented) rather than silently posting. (The real prepaid
 * amortization GL posting lives in the separate FIN-21 engine gated by AMORTIZATION_GL_POSTING_ENABLED,
 * covered by verify-amortization-gl-flag-gate.mjs.)
 *
 * This guard locks that no-unguarded-posting posture so the flag can advance to verify-then-flip:
 *   (1) the route resolves PREPAID_POST_FLAG ('PREPAID_EXPENSES_POST_ENABLED') via isEnabled(), and the
 *       flag-ON path REFUSES (gl_posting_not_implemented / 422) — it never posts;
 *   (2) the route contains NO unconditional journal-entry write (no INSERT INTO accounting.journal_entries,
 *       no postVoidReversal / posting-engine call) — posting stays behind the flag;
 *   (3) DEFAULT OFF: the seed migration (202606271610) registers the flag with default_enabled=false.
 *
 * Protected write path: apps/backend/src/accounting/prepaid-expenses.routes.ts (create handler ~L331).
 * --selftest exercises the assertions against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = "apps/backend/src/accounting/prepaid-expenses.routes.ts";
const MIGRATION = "db/migrations/202606271610_prepaid_expenses_data_model.sql";

function stripSql(src) {
  return src.replace(/--.*$/gm, "");
}
function seededDefaultOff(mig, key) {
  return new RegExp(`['"]${key}['"][\\s\\S]{0,600}?,\\s*false\\s*[,)]`).test(stripSql(mig));
}

export function assertPrepaid({ route, migration }) {
  const errors = [];
  if (!/PREPAID_POST_FLAG\s*=\s*["']PREPAID_EXPENSES_POST_ENABLED["']/.test(route)) {
    errors.push("route: PREPAID_POST_FLAG const ('PREPAID_EXPENSES_POST_ENABLED') missing");
  }
  const gate = route.search(/isEnabled\([^)]*PREPAID_POST_FLAG/);
  if (gate < 0) errors.push("route: create path does not resolve isEnabled(PREPAID_POST_FLAG)");
  // flag-ON path must REFUSE (posting deferred), not post.
  if (!/gl_posting_not_implemented/.test(route)) {
    errors.push("route: flag-ON path must refuse with gl_posting_not_implemented (posting is not implemented — never silently post)");
  }
  const refuse = route.search(/gl_posting_not_implemented/);
  if (gate >= 0 && refuse >= 0 && refuse < gate) {
    errors.push("route: the gl_posting_not_implemented refusal must follow the isEnabled(PREPAID_POST_FLAG) check");
  }
  // no unconditional GL posting anywhere in the route.
  if (/INSERT\s+INTO\s+accounting\.journal_entries/i.test(route)) {
    errors.push("route: contains an INSERT INTO accounting.journal_entries — prepaid create must post NO GL (path is deferred behind the flag)");
  }
  if (/postVoidReversal\s*\(|buildBillPaymentLines\s*\(|postingEngine\./.test(route)) {
    errors.push("route: invokes a posting/reversal engine — prepaid create must not post");
  }
  if (!seededDefaultOff(migration, "PREPAID_EXPENSES_POST_ENABLED")) {
    errors.push("migration: PREPAID_EXPENSES_POST_ENABLED not seeded with default_enabled=false (DEFAULT OFF)");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const good = {
    route: `const PREPAID_POST_FLAG = "PREPAID_EXPENSES_POST_ENABLED";
      const postEnabled = await isEnabled(client, PREPAID_POST_FLAG);
      if (postEnabled) { return reply.code(422).send({ error: "gl_posting_not_implemented" }); }
      await client.query("INSERT INTO accounting.prepaid_assets (...) VALUES (...)");`,
    migration: `INSERT INTO lib.feature_flags (flag_key, description, default_enabled)\nVALUES ('PREPAID_EXPENSES_POST_ENABLED', 'desc', false);`,
  };
  const bad = {
    route: `const OTHER = 1;
      await client.query("INSERT INTO accounting.journal_entries (...) VALUES (...)");`,
    migration: `INSERT INTO lib.feature_flags VALUES ('PREPAID_EXPENSES_POST_ENABLED', 'desc', true);`,
  };
  const g = assertPrepaid(good);
  const b = assertPrepaid(bad);
  if (g.length !== 0) { console.error("SELFTEST FAIL: good fixture flagged", g); process.exit(1); }
  if (b.length < 4) { console.error("SELFTEST FAIL: bad fixture under-caught", b); process.exit(1); }
  console.log("verify-prepaid-post-flag-gate selftest OK");
  process.exit(0);
}

const read = (rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.error(`verify-prepaid-post-flag-gate FAIL — missing ${rel}`); process.exit(1); }
  return fs.readFileSync(p, "utf8");
};
const errors = assertPrepaid({ route: read(ROUTE), migration: read(MIGRATION) });
if (errors.length) {
  console.error("verify-prepaid-post-flag-gate FAIL — PREPAID_EXPENSES_POST_ENABLED gate broken:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("verify-prepaid-post-flag-gate OK — flag-ON refuses (422, no post), route posts no GL, flag seeded default OFF.");
