#!/usr/bin/env node
/**
 * Settlement-dispute corrective-JE flag gate (Item 4).
 *
 * settlement-dispute.service.ts::createCorrectiveJournalEntry posts a journal entry. It must be gated on
 * SETTLEMENT_GL_POSTING_ENABLED (per-entity, default OFF) BEFORE it creates the JE — otherwise, with the
 * flag ON in prod, the corrective JE posts live regardless of intent (a pre-existing ungated path). Locks:
 *   (1) imports isEnabled + SETTLEMENT_GL_POSTING_FLAG_KEY.
 *   (2) inside createCorrectiveJournalEntry: resolves isEnabled(..., SETTLEMENT_GL_POSTING_FLAG_KEY, ...)
 *       and that gate runs BEFORE the createJournalEntry(...) call.
 *   (3) when OFF it posts nothing (a `return null` before createJournalEntry) — honest no-op, zero writes.
 *
 * --selftest exercises assertGate() against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-dispute-je-gate";
const SERVICE = "apps/backend/src/driver-finance/settlement-dispute.service.ts";
const MARKER = "export async function createCorrectiveJournalEntry";

/** Extract a function body from its declaration marker to the next top-level `export`. */
export function extractFn(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) return null;
  const rest = src.slice(start + marker.length);
  const end = rest.indexOf("\nexport ");
  return src.slice(start, start + marker.length + (end >= 0 ? end : rest.length));
}

export function assertGate({ service }) {
  const errors = [];

  // (1) imports
  if (!/import\s*\{\s*isEnabled\s*\}\s*from\s*["'][^"']*feature-flags\/service\.js["']/.test(service)) {
    errors.push(`${SERVICE}: does not import isEnabled from lib/feature-flags/service.js`);
  }
  if (!/SETTLEMENT_GL_POSTING_FLAG_KEY/.test(service)) {
    errors.push(`${SERVICE}: does not reference SETTLEMENT_GL_POSTING_FLAG_KEY`);
  }

  // (2)+(3) gate before the JE post, no-op when OFF
  const body = extractFn(service, MARKER);
  if (!body) {
    errors.push(`${SERVICE}: createCorrectiveJournalEntry not found`);
  } else {
    const gateIdx = body.search(/isEnabled\([\s\S]{0,120}?SETTLEMENT_GL_POSTING_FLAG_KEY/);
    const offIdx = body.search(/if\s*\(\s*!\s*flagOn\s*\)\s*return\s+null/);
    // ACCT-F5676 (#13264) switched the real call site from createJournalEntry(...) to
    // createJournalEntryOnClient(...) (reuses the caller's own open transaction — see this file's own
    // header comment) but this guard's anchor was never updated, so it stopped finding the post
    // entirely: "createJournalEntry" is a literal PREFIX of "createJournalEntryOnClient", and the old
    // regex required "(" immediately after "createJournalEntry" with only whitespace between — which
    // "OnClient(" is not. The gate-before-post property itself was never broken; the guard just went
    // blind to its own anchor. Accept either spelling.
    const postIdx = body.search(/createJournalEntry(?:OnClient)?\s*\(/);
    if (gateIdx < 0) errors.push(`${SERVICE}: createCorrectiveJournalEntry does not resolve isEnabled(..., SETTLEMENT_GL_POSTING_FLAG_KEY, ...)`);
    if (offIdx < 0) errors.push(`${SERVICE}: does not return null (post nothing) when the flag is OFF`);
    if (postIdx < 0) errors.push(`${SERVICE}: could not locate createJournalEntry(...) (guard anchor)`);
    if (gateIdx >= 0 && postIdx >= 0 && gateIdx > postIdx) {
      errors.push(`${SERVICE}: the SETTLEMENT_GL_POSTING gate must run BEFORE createJournalEntry (an OFF entity must post no corrective JE)`);
    }
    if (offIdx >= 0 && postIdx >= 0 && offIdx > postIdx) {
      errors.push(`${SERVICE}: the OFF-path return must precede createJournalEntry`);
    }
  }

  return errors;
}

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function selftest() {
  const imports = `import { isEnabled } from "../lib/feature-flags/service.js";\nconst SETTLEMENT_GL_POSTING_FLAG_KEY = "X";\n`;
  const good = imports +
    `export async function createCorrectiveJournalEntry(params) {\n` +
    `  const flagOn = await isEnabled(client, SETTLEMENT_GL_POSTING_FLAG_KEY, {});\n` +
    `  if (!flagOn) return null;\n` +
    `  const je = await createJournalEntry({}, {});\n` +
    `  return je.id;\n` +
    `}\nexport function next(){}`;
  const cases = [
    { name: "gated before post → 0", in: { service: good }, want: 0 },
    { name: "no isEnabled gate → error", in: { service: good.replace(/const flagOn[^\n]*\n\s*if[^\n]*\n/, "") }, wantMin: 1 },
    { name: "gate AFTER post → error", in: { service: imports +
      `export async function createCorrectiveJournalEntry(params) {\n` +
      `  const je = await createJournalEntry({}, {});\n` +
      `  const flagOn = await isEnabled(client, SETTLEMENT_GL_POSTING_FLAG_KEY, {});\n` +
      `  if (!flagOn) return null;\n  return je.id;\n}\nexport function next(){}` }, wantMin: 1 },
    { name: "no OFF return → error", in: { service: good.replace("if (!flagOn) return null;", "") }, wantMin: 1 },
    { name: "missing import → error", in: { service: good.replace(/import \{ isEnabled \}[^\n]*\n/, "") }, wantMin: 1 },
    // Regression guard for THIS fix: createJournalEntryOnClient(...) (the real, current call shape
    // since ACCT-F5676) must be recognized as a valid post anchor, not just the bare form.
    { name: "OnClient variant recognized → 0", in: { service: good.replace("createJournalEntry({}, {})", "createJournalEntryOnClient(client, {})") }, want: 0 },
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

const service = read(SERVICE);
if (service == null) { console.error(`[${LABEL}] FAILED — missing ${SERVICE}`); process.exit(1); }
const errors = assertGate({ service });
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — corrective-JE is gated on SETTLEMENT_GL_POSTING_ENABLED before posting (OFF => no JE).`);
