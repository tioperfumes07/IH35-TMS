#!/usr/bin/env node
// verify-je-void-reverses-not-voids.mjs (2026-07-12)
// JE-VOID Option 1 (NetSuite/QBO reversing-entry model). Voiding a posted journal entry must NEVER flip the
// original's status (the GL reports exclude status='voided', so a flip silently drops the entry). It must
// post a LINKED reversing JE and record bidirectional header linkage. This guard locks that invariant so it
// cannot regress to a status flip.
//
// Asserts voidJournalEntry() in journal-entries.service.ts:
//   (1) requires a non-empty reason server-side (throws 'void_reason_required');
//   (2) blocks double-reversal (throws 'journal_entry_already_reversed');
//   (3) calls postVoidReversal(...) to create the reversing JE;
//   (4) sets BOTH linkage columns — reversed_by_je_id (on the original) AND reverses_je_id (on the reversal);
//   (5) does NOT set status='voided' / voided_at anywhere in voidJournalEntry (no flip of the original);
//   (6) the linkage migration exists (reversed_by_je_id + reverses_je_id on accounting.journal_entries).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-je-void-reverses-not-voids";
const SERVICE = "apps/backend/src/accounting/journal-entries.service.ts";
const MIGRATION = "db/migrations/202607340000_je_reversal_linkage.sql";

/** Extract the voidJournalEntry function body (from its declaration to the next top-level `export`). */
export function extractVoidFn(src) {
  const start = src.indexOf("export async function voidJournalEntry");
  if (start < 0) return null;
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next < 0 ? src.length : next);
}

export function checkVoidFn(body) {
  const errs = [];
  if (!/throw new Error\(\s*["']void_reason_required["']\s*\)/.test(body)) errs.push("does not require a non-empty reason (throw 'void_reason_required')");
  if (!/throw new Error\(\s*["']journal_entry_already_reversed["']\s*\)/.test(body)) errs.push("does not block double-reversal (throw 'journal_entry_already_reversed')");
  if (!/postVoidReversal\s*\(/.test(body)) errs.push("does not call postVoidReversal() to create the reversing JE");
  if (!/reversed_by_je_id\s*=\s*\$/.test(body)) errs.push("does not set reversed_by_je_id on the original (linkage)");
  if (!/reverses_je_id\s*=\s*\$/.test(body)) errs.push("does not set reverses_je_id on the reversal (linkage)");
  // The original must NOT be flipped to voided anywhere in the void function.
  if (/status\s*=\s*'voided'/.test(body)) errs.push("flips the original to status='voided' — Option 1 forbids mutating the original (it is dropped from the GL, which excludes 'voided')");
  if (/voided_at\s*=\s*now\(\)/.test(body)) errs.push("sets voided_at on the original — Option 1 leaves the original untouched (status='posted')");
  return errs;
}

if (process.argv.includes("--selftest")) {
  const good =
    `export async function voidJournalEntry() {\n` +
    `  if (!voidReason) throw new Error("void_reason_required");\n` +
    `  if (existing.reversed_by_je_id) throw new Error("journal_entry_already_reversed");\n` +
    `  const reversal = await postVoidReversal(client, {}, {});\n` +
    `  await client.query('UPDATE ... SET reversed_by_je_id = $2 ...');\n` +
    `  await client.query('UPDATE ... SET reverses_je_id = $2 ...');\n` +
    `}\nexport function next(){}`;
  const flip = good.replace("await client.query('UPDATE ... SET reverses_je_id = $2 ...');", "await client.query(\"UPDATE ... SET status = 'voided', voided_at = now() ...\");");
  const cases = [
    { n: "well-formed → 0", errs: checkVoidFn(extractVoidFn(good)).length, want: 0 },
    { n: "status flip → flagged", errs: checkVoidFn(extractVoidFn(flip)).length, wantMin: 1 },
    { n: "missing reason → flagged", errs: checkVoidFn(extractVoidFn(good.replace('throw new Error("void_reason_required")', "noop()"))).length, wantMin: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const ok = c.want !== undefined ? c.errs === c.want : c.errs >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n} (errs=${c.errs})`);
  }
  if (failed) { console.error(`${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const errs = [];
const svc = (() => { try { return fs.readFileSync(path.join(ROOT, SERVICE), "utf8"); } catch { return null; } })();
if (svc == null) { console.error(`[${LABEL}] FAILED — missing ${SERVICE}`); process.exit(1); }
const body = extractVoidFn(svc);
if (!body) { console.error(`[${LABEL}] FAILED — voidJournalEntry not found`); process.exit(1); }
errs.push(...checkVoidFn(body));

const mig = (() => { try { return fs.readFileSync(path.join(ROOT, MIGRATION), "utf8"); } catch { return null; } })();
if (mig == null) errs.push(`missing linkage migration ${MIGRATION}`);
else {
  if (!/ADD COLUMN IF NOT EXISTS reversed_by_je_id/.test(mig)) errs.push(`${MIGRATION}: does not add reversed_by_je_id`);
  if (!/ADD COLUMN IF NOT EXISTS reverses_je_id/.test(mig)) errs.push(`${MIGRATION}: does not add reverses_je_id`);
}

if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — JE void posts a linked reversing JE (both-way linkage), never flips the original.`);
