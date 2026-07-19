#!/usr/bin/env node
// verify-je-void-reverses-not-voids.mjs (2026-07-12; extended by GOV-JE-VOID-FIX)
// JE-VOID Option 1 (NetSuite/QBO reversing-entry model). Voiding a posted journal entry must NEVER flip the
// original's status (the GL reports exclude status='voided', so a flip silently drops the entry). It must
// post a LINKED reversing JE and record bidirectional header linkage. This guard locks that invariant on
// BOTH JE-void paths so neither can regress to a status flip:
//   • the SHARED helper reverseJournalEntryNoFlip() in journal-entries.service.ts (the mechanics), and
//   • the two CALLERS — direct voidJournalEntry() (journal-entries.service.ts) AND governance
//     executeJournalEntry() (void-cancel-executors.ts) — which must delegate to the helper and NOT flip.
// The guard scanning ONLY the direct service is exactly why the governance path drifted (#2415/#2416);
// covering executeJournalEntry closes that blind spot.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-je-void-reverses-not-voids";
const SERVICE = "apps/backend/src/accounting/journal-entries.service.ts";
const GOV = "apps/backend/src/governance/void-cancel-executors.ts";
const MIGRATION = "db/migrations/202607340000_je_reversal_linkage.sql";

const FLIP_STATUS = /status\s*=\s*['"]voided['"]/;
const FLIP_VOIDED_AT = /voided_at\s*=\s*now\(\)/;

/** Extract a named function body (from its declaration marker to the next top-level boundary). Works for
 *  `export async function <name>` and `const <name>: ... = async` forms. */
export function extractFn(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) return null;
  const rest = src.slice(start + marker.length);
  const bounds = ["\nexport ", "\nconst execute", "\nfunction "].map((b) => rest.indexOf(b)).filter((i) => i >= 0);
  const end = bounds.length ? Math.min(...bounds) : rest.length;
  return src.slice(start, start + marker.length + end);
}

/** The SHARED helper must carry the reverse-not-flip + bidirectional-linkage mechanics and never flip. */
export function checkHelperMechanics(body) {
  const errs = [];
  const blocksDuplicateByThrow = /throw new Error\(\s*["']journal_entry_already_reversed["']\s*\)/.test(body);
  const returnsExistingReversal = /if\s*\(\s*existingReversal\s*\)\s*\{\s*return\s*\{/.test(body);
  if (!blocksDuplicateByThrow && !returnsExistingReversal) {
    errs.push("helper: does not block double-reversal (must throw or return deterministic existingReversal)");
  }
  if (!/postVoidReversal\s*\(/.test(body)) errs.push("helper: does not call postVoidReversal() to create the reversing JE");
  if (!/reversed_by_je_id\s*=\s*\$/.test(body)) errs.push("helper: does not set reversed_by_je_id on the original (linkage)");
  if (!/reverses_je_id\s*=\s*\$/.test(body)) errs.push("helper: does not set reverses_je_id on the reversal (linkage)");
  if (FLIP_STATUS.test(body)) errs.push("helper: flips the original to status='voided' — Option 1 forbids mutating the original");
  if (FLIP_VOIDED_AT.test(body)) errs.push("helper: sets voided_at on the original — Option 1 leaves the original status='posted'");
  return errs;
}

/** A JE-void CALLER must NOT flip the original AND must delegate to the shared helper (no re-implementation). */
export function checkCallerReverseNotFlip(body, name) {
  const errs = [];
  if (FLIP_STATUS.test(body)) errs.push(`${name}: flips the JE original to status='voided' — must reverse-not-flip (GL excludes 'voided')`);
  if (FLIP_VOIDED_AT.test(body)) errs.push(`${name}: sets voided_at on the JE original — must reverse-not-flip`);
  if (!/reverseJournalEntryNoFlip\s*\(/.test(body)) errs.push(`${name}: does not delegate to the shared reverseJournalEntryNoFlip helper`);
  return errs;
}

if (process.argv.includes("--selftest")) {
  const helperGood =
    `export async function reverseJournalEntryNoFlip() {\n` +
    `  if (existingReversal) { return { reversal: existingReversal }; }\n` +
    `  const reversal = await postVoidReversal(client, {}, {});\n` +
    `  await client.query('UPDATE ... SET reversed_by_je_id = $2 ...');\n` +
    `  await client.query('UPDATE ... SET reverses_je_id = $2 ...');\n` +
    `}\nexport async function voidJournalEntry(){}`;
  const callerGood = `const { reversal } = await reverseJournalEntryNoFlip(client, {});\nreturn { ok: true };`;
  const callerFlip = `const flipped = await client.query("UPDATE ... SET status = 'voided', voided_at = now() ...");`;
  const cases = [
    { n: "helper well-formed → 0", errs: checkHelperMechanics(extractFn(helperGood, "export async function reverseJournalEntryNoFlip")).length, want: 0 },
    { n: "helper missing linkage → flagged", errs: checkHelperMechanics(extractFn(helperGood.replace("SET reverses_je_id = $2", "noop"), "export async function reverseJournalEntryNoFlip")).length, wantMin: 1 },
    { n: "caller delegates + no flip → 0", errs: checkCallerReverseNotFlip(callerGood, "x").length, want: 0 },
    { n: "caller flips status → flagged", errs: checkCallerReverseNotFlip(callerFlip, "x").length, wantMin: 1 },
    { n: "caller does not delegate → flagged", errs: checkCallerReverseNotFlip("return { ok: true };", "x").length, wantMin: 1 },
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

// (1) the shared helper mechanics
const helperBody = extractFn(svc, "export async function reverseJournalEntryNoFlip");
if (!helperBody) errs.push("shared reverseJournalEntryNoFlip helper not found in journal-entries.service.ts");
else errs.push(...checkHelperMechanics(helperBody));

// (2) direct caller: voidJournalEntry — no flip + delegates + requires a reason
const directBody = extractFn(svc, "export async function voidJournalEntry");
if (!directBody) errs.push("voidJournalEntry not found");
else {
  errs.push(...checkCallerReverseNotFlip(directBody, "voidJournalEntry"));
  if (!/throw new Error\(\s*["']void_reason_required["']\s*\)/.test(directBody)) errs.push("voidJournalEntry: does not require a non-empty reason (throw 'void_reason_required')");
}

// (3) governance caller: executeJournalEntry — no flip + delegates (closes the blind spot)
const gov = (() => { try { return fs.readFileSync(path.join(ROOT, GOV), "utf8"); } catch { return null; } })();
if (gov == null) { console.error(`[${LABEL}] FAILED — missing ${GOV}`); process.exit(1); }
const govBody = extractFn(gov, "const executeJournalEntry: EntityExecutor = async");
if (!govBody) errs.push("executeJournalEntry not found in void-cancel-executors.ts");
else errs.push(...checkCallerReverseNotFlip(govBody, "executeJournalEntry (governance)"));

// (4) the linkage migration exists
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
console.log(`[${LABEL}] OK — both JE-void paths (direct + governance) reverse-not-flip via the shared helper; never flip the original.`);
