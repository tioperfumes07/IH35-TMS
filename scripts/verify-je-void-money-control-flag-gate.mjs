#!/usr/bin/env node
/**
 * GL/Void flag-gate guard — MONEY_CONTROL_VOID_REVERSAL_ENABLED (AF-7 per-entity void kill switch).
 *
 * The void ACTION on a posted journal entry must be OFF by default and enable-able ONLY per entity
 * (an explicit tenant override), so an owner turns JE-void on entity-by-entity — verify-then-flip.
 * This is orthogonal to VOID_ENFORCEMENT_ENABLED (which controls whether a REVERSING JE posts on void).
 *
 * This guard locks the gate so it cannot regress:
 *   (1) FLAG KEY: journal-entries.service.ts defines
 *       MONEY_CONTROL_VOID_REVERSAL_FLAG_KEY = 'MONEY_CONTROL_VOID_REVERSAL_ENABLED'.
 *   (2) GATE BEFORE MUTATION: voidJournalEntry resolves isEnabled(client, MONEY_CONTROL_VOID_REVERSAL_FLAG_KEY, …)
 *       and throws 'void_reversal_disabled' when OFF, BEFORE the reversing-JE post (postVoidReversal(...)) — so an
 *       OFF entity can never post a reversal (no silent no-op; a hard policy error).
 *   (3) ROUTE MAPS 409: journal-entries.routes.ts maps 'void_reversal_disabled' → reply.code(409).
 *   (4) PER-ENTITY-ONLY: the flag is in PER_ENTITY_ONLY_FLAG_KEYS (feature-flags service) so default/rollout
 *       can never turn it on globally — enable is only via an explicit per-entity override.
 *   (5) DEFAULT OFF: the AF-7 seed migration (202607110320) registers the flag with default_enabled=false.
 *
 * --selftest exercises the assertions against inline fixtures (pass + each failure mode).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-je-void-money-control-flag-gate";
const SERVICE = "apps/backend/src/accounting/journal-entries.service.ts";
const ROUTES = "apps/backend/src/accounting/journal-entries.routes.ts";
const FLAG_SERVICE = "apps/backend/src/lib/feature-flags/service.ts";
const MIGRATION = "db/migrations/202607110320_af7_money_control_flags.sql";
const KEY = "MONEY_CONTROL_VOID_REVERSAL_ENABLED";

function stripSql(src) {
  return src.replace(/--.*$/gm, "");
}

/** Extract a named function body (declaration marker → next top-level boundary). Mirrors the helper in
 *  verify-je-void-reverses-not-voids.mjs so this guard can scope assertion (2) to voidJournalEntry's OWN
 *  body — the reverseJournalEntryNoFlip helper is defined ABOVE it and itself calls postVoidReversal, so a
 *  whole-file anchor is fooled (the helper's call precedes the gate). */
export function extractFn(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) return null;
  const rest = src.slice(start + marker.length);
  const bounds = ["\nexport ", "\nconst execute", "\nfunction "].map((b) => rest.indexOf(b)).filter((i) => i >= 0);
  const end = bounds.length ? Math.min(...bounds) : rest.length;
  return src.slice(start, start + marker.length + end);
}

export function assertGate({ service, routes, flagService, migration }) {
  const errors = [];

  // (1) flag key const
  if (!new RegExp(`MONEY_CONTROL_VOID_REVERSAL_FLAG_KEY\\s*=\\s*["']${KEY}["']`).test(service)) {
    errors.push(`${SERVICE}: MONEY_CONTROL_VOID_REVERSAL_FLAG_KEY const ('${KEY}') missing`);
  }

  // (2) gate resolved BEFORE the reversal, throwing void_reversal_disabled when off — scoped to
  //     voidJournalEntry's OWN body (the reverseJournalEntryNoFlip helper sits above it and calls
  //     postVoidReversal, so a whole-file anchor false-positives). Anchor on the reversal trigger the body
  //     actually calls (reverseJournalEntryNoFlip), not postVoidReversal.
  const voidBody = extractFn(service, "export async function voidJournalEntry");
  if (!voidBody) {
    errors.push(`${SERVICE}: voidJournalEntry not found`);
  } else {
    const gateIdx = voidBody.search(/isEnabled\(\s*client\s*,\s*MONEY_CONTROL_VOID_REVERSAL_FLAG_KEY/);
    const throwIdx = voidBody.search(/throw new Error\(\s*["']void_reversal_disabled["']\s*\)/);
    const mutateIdx = voidBody.search(/reverseJournalEntryNoFlip\s*\(/);
    if (gateIdx < 0) errors.push(`${SERVICE}: voidJournalEntry does not resolve isEnabled(client, MONEY_CONTROL_VOID_REVERSAL_FLAG_KEY, …)`);
    if (throwIdx < 0) errors.push(`${SERVICE}: does not throw 'void_reversal_disabled' when the flag is OFF`);
    if (mutateIdx < 0) errors.push(`${SERVICE}: could not locate reverseJournalEntryNoFlip(...) (guard anchor)`);
    if (gateIdx >= 0 && throwIdx >= 0 && gateIdx > throwIdx) {
      errors.push(`${SERVICE}: the isEnabled(...) resolve must precede the throw`);
    }
    if (gateIdx >= 0 && mutateIdx >= 0 && gateIdx > mutateIdx) {
      errors.push(`${SERVICE}: the money-control gate must run BEFORE the reversal (reverseJournalEntryNoFlip)`);
    }
  }

  // (3) route maps the policy error to 409
  if (!/void_reversal_disabled["'][\s\S]{0,80}?reply\.code\(409\)/.test(routes)) {
    errors.push(`${ROUTES}: does not map 'void_reversal_disabled' → 409`);
  }

  // (4) per-entity-only
  const perEntityBlock = /PER_ENTITY_ONLY_FLAG_KEYS[\s\S]*?\]\)/.exec(flagService);
  if (!perEntityBlock || !perEntityBlock[0].includes(KEY)) {
    errors.push(`${FLAG_SERVICE}: ${KEY} is not in PER_ENTITY_ONLY_FLAG_KEYS (it must be per-entity-only so it can't be turned on globally)`);
  }

  // (5) seeded default OFF
  const mig = stripSql(migration);
  if (!new RegExp(`['"]${KEY}['"][\\s\\S]{0,900}?,\\s*false\\s*[,)]`).test(mig)) {
    errors.push(`${MIGRATION}: ${KEY} must be seeded with default_enabled = false`);
  }

  return errors;
}

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function selftest() {
  const good = {
    service:
      `const MONEY_CONTROL_VOID_REVERSAL_FLAG_KEY = "${KEY}";\n` +
      `export async function voidJournalEntry() {\n` +
      `  const voidActionEnabled = await isEnabled(client, MONEY_CONTROL_VOID_REVERSAL_FLAG_KEY, { operating_company_id: x });\n` +
      `  if (!voidActionEnabled) throw new Error("void_reversal_disabled");\n` +
      `  const { reversal } = await reverseJournalEntryNoFlip(client, {});\n` +
      `}\nexport function next(){}`,
    routes: `if (message === "void_reversal_disabled") return reply.code(409).send({ error: message });`,
    flagService: `export const PER_ENTITY_ONLY_FLAG_KEYS = new Set(["${KEY}"])`,
    migration: `INSERT INTO lib.feature_flags VALUES ('${KEY}', 'desc', false, 0)`,
  };
  const cases = [
    { name: "well-formed gate → 0 errors", in: good, want: 0 },
    { name: "missing flag key const", in: { ...good, service: good.service.replace(/MONEY_CONTROL_VOID_REVERSAL_FLAG_KEY = "[^"]+"/, "X = 1") }, wantMin: 1 },
    { name: "gate AFTER mutation → error", in: { ...good, service:
      `const MONEY_CONTROL_VOID_REVERSAL_FLAG_KEY = "${KEY}";\n` +
      `export async function voidJournalEntry() {\n` +
      `  const { reversal } = await reverseJournalEntryNoFlip(client, {});\n` +
      `  const voidActionEnabled = await isEnabled(client, MONEY_CONTROL_VOID_REVERSAL_FLAG_KEY, {});\n` +
      `  if (!voidActionEnabled) throw new Error("void_reversal_disabled");\n` +
      `}\nexport function next(){}` }, wantMin: 1 },
    { name: "route not 409", in: { ...good, routes: `// no mapping` }, wantMin: 1 },
    { name: "not per-entity-only", in: { ...good, flagService: `export const PER_ENTITY_ONLY_FLAG_KEYS = new Set([])` }, wantMin: 1 },
    { name: "not default OFF", in: { ...good, migration: `INSERT INTO lib.feature_flags VALUES ('${KEY}', 'd', true, 0)` }, wantMin: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = assertGate(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) { console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const inputs = { service: read(SERVICE), routes: read(ROUTES), flagService: read(FLAG_SERVICE), migration: read(MIGRATION) };
for (const [k, v] of Object.entries(inputs)) {
  if (v == null) { console.error(`[${LABEL}] FAILED — missing file for ${k}`); process.exit(1); }
}
const errors = assertGate(inputs);
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — JE void is gated behind ${KEY} (per-entity, default OFF), policy-error before any mutation.`);
