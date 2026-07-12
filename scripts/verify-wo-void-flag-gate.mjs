#!/usr/bin/env node
/**
 * Wave-3 flag-gate guard — WO_VOID_ENABLED (work-order void -> reverse linked bill/expense GL).
 *
 * Voiding/cancelling a work order that has posted financials must reverse the linked bill/expense GL
 * (via the shared void engine, postVoidReversal) rather than orphan it. That reversal is gated per
 * entity by WO_VOID_ENABLED (default OFF): with the flag OFF and financial linkage present the WO void
 * REFUSES (financial_blocked) so posted entries are never orphaned; with it ON, each linked bill/expense
 * is reversed. This guard locks the gate so it can advance to verify-then-flip:
 *
 *   (1) FLAG GATE: work-orders.routes.ts resolves WO_VOID_ENABLED per-entity via
 *       isEnabled(client, "WO_VOID_ENABLED", { operating_company_id }) — never a global process.env read.
 *   (2) NO UNCONDITIONAL REVERSAL / NO ORPHAN: the flag check precedes every postVoidReversal() call,
 *       and flag-OFF + financial linkage returns financial_blocked (refuse, don't orphan).
 *   (3) DEFAULT OFF: the seed migration (202606300040) registers WO_VOID_ENABLED with
 *       default_enabled=false.
 *
 * Protected write: apps/backend/src/work-orders/work-orders.routes.ts settleWorkOrderFinancialLinkage()
 *   — postVoidReversal() for each linked bill (~L246) and expense (~L288), reached only behind the flag.
 * --selftest exercises the assertions against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = "apps/backend/src/work-orders/work-orders.routes.ts";
const MIGRATION = "db/migrations/202606300040_per_entity_posting_flags.sql";

function stripSql(src) {
  return src.replace(/--.*$/gm, "");
}
function seededDefaultOff(mig, key) {
  return new RegExp(`['"]${key}['"][\\s\\S]{0,600}?,\\s*false\\s*[,)]`).test(stripSql(mig));
}

export function assertWoVoid({ route, migration }) {
  const errors = [];
  const gate = route.search(/isEnabled\([^)]*["']WO_VOID_ENABLED["']/);
  if (gate < 0) {
    errors.push('route: WO void does not resolve isEnabled(client, "WO_VOID_ENABLED", { operating_company_id }) per-entity');
  }
  if (/process\.env\.WO_VOID_ENABLED/.test(route)) {
    errors.push("route: WO_VOID_ENABLED must not be read from process.env (per-entity flag resolution only)");
  }
  const post = route.search(/postVoidReversal\s*\(/);
  if (post < 0) errors.push("route: never calls postVoidReversal() (unexpected — no reversal path)");
  if (gate >= 0 && post >= 0 && gate > post) {
    errors.push("route: postVoidReversal() is not gated — the WO_VOID_ENABLED check must precede any reversal (no unconditional reversing JE)");
  }
  // flag OFF + financial linkage must refuse (never orphan posted entries).
  if (!/financial_blocked/.test(route)) {
    errors.push("route: missing the financial_blocked refusal (flag OFF + posted linkage must refuse, never orphan)");
  }
  if (!seededDefaultOff(migration, "WO_VOID_ENABLED")) {
    errors.push("migration: WO_VOID_ENABLED not seeded with default_enabled=false (DEFAULT OFF)");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const good = {
    route: `const woVoidEnabled = await isEnabled(client as never, "WO_VOID_ENABLED", { operating_company_id: oc });
      if (!woVoidEnabled) return { kind: "financial_blocked" };
      const reversal = await postVoidReversal(client, {}, {});`,
    migration: `INSERT INTO lib.feature_flags (flag_key, description, default_enabled)\nVALUES ('WO_VOID_ENABLED', 'desc', false);`,
  };
  const bad = {
    route: `const reversal = await postVoidReversal(client, {}, {});
      const woVoidEnabled = process.env.WO_VOID_ENABLED === "1";`,
    migration: `INSERT INTO lib.feature_flags VALUES ('WO_VOID_ENABLED', 'desc', true);`,
  };
  const g = assertWoVoid(good);
  const b = assertWoVoid(bad);
  if (g.length !== 0) { console.error("SELFTEST FAIL: good fixture flagged", g); process.exit(1); }
  if (b.length < 4) { console.error("SELFTEST FAIL: bad fixture under-caught", b); process.exit(1); }
  console.log("verify-wo-void-flag-gate selftest OK");
  process.exit(0);
}

const read = (rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.error(`verify-wo-void-flag-gate FAIL — missing ${rel}`); process.exit(1); }
  return fs.readFileSync(p, "utf8");
};
const errors = assertWoVoid({ route: read(ROUTE), migration: read(MIGRATION) });
if (errors.length) {
  console.error("verify-wo-void-flag-gate FAIL — WO_VOID_ENABLED gate broken:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("verify-wo-void-flag-gate OK — WO void gates postVoidReversal on isEnabled(WO_VOID_ENABLED) per-entity, refuses when OFF; flag seeded default OFF.");
