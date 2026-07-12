#!/usr/bin/env node
/**
 * Wave-3 flag-gate guard — VOID_ENFORCEMENT_ENABLED (VOID-EVERYWHERE shared void engine).
 *
 * When ON, voiding an invoice / bill / journal entry posts an equal-and-opposite REVERSING journal
 * entry (postVoidReversal) before the status flip; when OFF (default) the void is a status-flip only,
 * nothing new posts. This guard locks the gate so it can advance to verify-then-flip:
 *
 *   (1) FLAG KEY + GATE: void.service.ts defines VOID_FLAG_KEY = 'VOID_ENFORCEMENT_ENABLED' and
 *       isVoidEnforcementEnabled() resolves it via isEnabled(client, VOID_FLAG_KEY, ...).
 *   (2) NO UNCONDITIONAL REVERSAL: every void caller (invoices.routes / bills.service /
 *       journal-entries.service) resolves isVoidEnforcementEnabled() BEFORE it calls postVoidReversal()
 *       — the reversing JE never posts unless the flag is ON for the entity.
 *   (3) DEFAULT OFF: the seed migration (202606141200) registers VOID_ENFORCEMENT_ENABLED with
 *       default_enabled=false.
 *
 * Protected write: apps/backend/src/accounting/void.service.ts postVoidReversal() (~L181, inserts the
 * reversing JE + postings), reached only behind the flag from each caller listed above.
 * --selftest exercises the assertions against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/accounting/void.service.ts";
const MIGRATION = "db/migrations/202606141200_void_enforcement_flag.sql";
// NOTE: journal-entries.service.ts was REMOVED (2026-07-12). JE void moved to the Option-1 NetSuite/QBO
// reversing-entry model: it ALWAYS posts a linked reversing JE (never a status flip), gated by the AF-7
// MONEY_CONTROL_VOID_REVERSAL_ENABLED kill switch, not VOID_ENFORCEMENT_ENABLED. Its invariant is locked by
// verify-je-void-reverses-not-voids.mjs. Invoices/bills keep the VOID_ENFORCEMENT_ENABLED model (this guard).
const CALLERS = [
  "apps/backend/src/accounting/invoices.routes.ts",
  "apps/backend/src/accounting/bills.service.ts",
];

function stripSql(src) {
  return src.replace(/--.*$/gm, "");
}
function seededDefaultOff(mig, key) {
  return new RegExp(`['"]${key}['"][\\s\\S]{0,700}?,\\s*false\\s*[,)]`).test(stripSql(mig));
}

export function assertVoidEnforcement({ service, migration, callers }) {
  const errors = [];
  if (!/VOID_FLAG_KEY\s*=\s*["']VOID_ENFORCEMENT_ENABLED["']/.test(service)) {
    errors.push("void.service: VOID_FLAG_KEY const ('VOID_ENFORCEMENT_ENABLED') missing");
  }
  if (!/isEnabled\(\s*client\s*,\s*VOID_FLAG_KEY/.test(service)) {
    errors.push("void.service: isVoidEnforcementEnabled must resolve isEnabled(client, VOID_FLAG_KEY, ...)");
  }
  for (const [name, src] of Object.entries(callers)) {
    const gate = src.search(/isVoidEnforcementEnabled\s*\(/);
    const post = src.search(/postVoidReversal\s*\(/);
    if (gate < 0) errors.push(`${name}: does not resolve isVoidEnforcementEnabled() before voiding`);
    if (post < 0) errors.push(`${name}: never calls postVoidReversal() (unexpected — no reversal path)`);
    if (gate >= 0 && post >= 0 && gate > post) {
      errors.push(`${name}: postVoidReversal() is not gated — the flag check must precede the reversal (no unconditional reversing JE)`);
    }
  }
  if (!seededDefaultOff(migration, "VOID_ENFORCEMENT_ENABLED")) {
    errors.push("migration: VOID_ENFORCEMENT_ENABLED not seeded with default_enabled=false (DEFAULT OFF)");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const goodCaller = `const flagOn = await isVoidEnforcementEnabled(client, oc, u);
    if (flagOn) { reversal = await postVoidReversal(client, {}, {}); }`;
  const good = {
    service: `export const VOID_FLAG_KEY = "VOID_ENFORCEMENT_ENABLED";
      export async function isVoidEnforcementEnabled(client, oc, u) { return isEnabled(client, VOID_FLAG_KEY, {}); }`,
    migration: `INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)\nVALUES ('VOID_ENFORCEMENT_ENABLED', 'desc', false, 0);`,
    callers: { "invoices.routes.ts": goodCaller, "bills.service.ts": goodCaller, "journal-entries.service.ts": goodCaller },
  };
  const badCaller = `reversal = await postVoidReversal(client, {}, {});
    const flagOn = await isVoidEnforcementEnabled(client, oc, u);`;
  const bad = {
    service: `export const VOID_FLAG_KEY = "OTHER";`,
    migration: `INSERT INTO lib.feature_flags VALUES ('VOID_ENFORCEMENT_ENABLED', 'desc', true);`,
    callers: { "invoices.routes.ts": badCaller, "bills.service.ts": badCaller, "journal-entries.service.ts": badCaller },
  };
  const g = assertVoidEnforcement(good);
  const b = assertVoidEnforcement(bad);
  if (g.length !== 0) { console.error("SELFTEST FAIL: good fixture flagged", g); process.exit(1); }
  if (b.length < 5) { console.error("SELFTEST FAIL: bad fixture under-caught", b); process.exit(1); }
  console.log("verify-void-enforcement-flag-gate selftest OK");
  process.exit(0);
}

const read = (rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.error(`verify-void-enforcement-flag-gate FAIL — missing ${rel}`); process.exit(1); }
  return fs.readFileSync(p, "utf8");
};
const callers = Object.fromEntries(CALLERS.map((rel) => [path.basename(rel), read(rel)]));
const errors = assertVoidEnforcement({ service: read(SERVICE), migration: read(MIGRATION), callers });
if (errors.length) {
  console.error("verify-void-enforcement-flag-gate FAIL — VOID_ENFORCEMENT_ENABLED gate broken:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("verify-void-enforcement-flag-gate OK — every void caller gates postVoidReversal on isVoidEnforcementEnabled; flag seeded default OFF.");
