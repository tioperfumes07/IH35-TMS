#!/usr/bin/env node
/**
 * verify-reversal-recognizes-cross-mechanism-reversal.mjs (ACCT-F9877)
 *
 * executeSourceReversalOnClient's own idempotency check only recognized a reversal created THROUGH
 * ITSELF (a posting_batches row keyed on its own posting-mvp idempotency-key format). A journal
 * entry reversed through the SEPARATE postVoidReversal/reverseJournalEntryNoFlip mechanism (tracked
 * via journal_entries.reversed_by_je_id, never touching posting_batches) looked unreversed to this
 * function, which would then attempt to build a SECOND reversing JE for the same original --
 * live-reproduced on a disposable Neon branch: uq_je_reverses_je_id correctly rejected the duplicate
 * INSERT, surfaced to the caller as a raw, opaque database error instead of a recognized,
 * already-reversed result.
 *
 * The fix adds findCrossMechanismReversal(), called AFTER the same-mechanism check and BEFORE any
 * new reversal is built, reading journal_entries.reversed_by_je_id directly off the original.
 *
 * This guard asserts, against the REAL file:
 *   1. findCrossMechanismReversal exists and reads reversed_by_je_id.
 *   2. executeSourceReversalOnClient calls it AFTER the same-mechanism getPostingBySource(...,
 *      "reversal") check and BEFORE it queries originalLines (the first step of building a new
 *      reversal) -- ordering matters: checking after building would be the exact race this fixes.
 *
 * FAIL if the cross-mechanism check is removed, or reordered to run after reversal-building begins.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reversal-recognizes-cross-mechanism-reversal";
const TARGET_FILE = "apps/backend/src/accounting/posting-engine.service.ts";

function readReal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * Injectable core: pass `src` to exercise this exact function against synthetic content; omit it
 * to check the real repo file.
 */
export function check(src) {
  const failures = [];
  const source = src != null ? src : (() => { try { return readReal(TARGET_FILE); } catch { return null; } })();
  if (source == null) return [`${TARGET_FILE} not found`];

  const helperStart = source.indexOf("async function findCrossMechanismReversal(");
  if (helperStart < 0) {
    failures.push(`${TARGET_FILE}: findCrossMechanismReversal not found -- the cross-mechanism recognition helper may have been removed`);
  } else {
    const helperBody = source.slice(helperStart, helperStart + 1200);
    if (!/reversed_by_je_id/.test(helperBody)) {
      failures.push(`${TARGET_FILE}: findCrossMechanismReversal no longer reads reversed_by_je_id`);
    }
  }

  const fnStart = source.indexOf("async function executeSourceReversalOnClient(");
  if (fnStart < 0) {
    failures.push(`${TARGET_FILE}: executeSourceReversalOnClient not found -- extractor may be stale`);
    return failures;
  }
  const sameMechCheckIdx = source.indexOf('getPostingBySource(client, input.operating_company_id, sourceType, sourceId, "reversal")', fnStart);
  const crossMechCallIdx = source.indexOf("findCrossMechanismReversal(client, input.operating_company_id, original)", fnStart);
  const buildStartIdx = source.indexOf("const originalLines = await client.query", fnStart);

  if (sameMechCheckIdx < 0) {
    failures.push(`${TARGET_FILE}: executeSourceReversalOnClient's own same-mechanism reversal check not found`);
  }
  if (crossMechCallIdx < 0) {
    failures.push(`${TARGET_FILE}: executeSourceReversalOnClient no longer calls findCrossMechanismReversal`);
  }
  if (buildStartIdx < 0) {
    failures.push(`${TARGET_FILE}: executeSourceReversalOnClient's reversal-building step (originalLines query) not found -- extractor may be stale`);
  }

  if (sameMechCheckIdx >= 0 && crossMechCallIdx >= 0 && crossMechCallIdx < sameMechCheckIdx) {
    failures.push(
      `${TARGET_FILE}: findCrossMechanismReversal is called BEFORE the same-mechanism check -- ordering ` +
        `doesn't matter here as much as it running before the build step, but this suggests the function was restructured`
    );
  }
  if (crossMechCallIdx >= 0 && buildStartIdx >= 0 && crossMechCallIdx > buildStartIdx) {
    failures.push(
      `${TARGET_FILE}: findCrossMechanismReversal is called AFTER reversal-building has already started -- ` +
        `this is the exact race the fix closes; checking after building begins can still let a duplicate ` +
        `INSERT reach the database`
    );
  }

  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  const good = `
async function findCrossMechanismReversal(client, operatingCompanyId, original) {
  const headerRes = await client.query(
    \`SELECT reversed_by_je_id::text FROM accounting.journal_entries WHERE id = $1::uuid\`,
    [original.journal_entry_id]
  );
  return headerRes.rows[0]?.reversed_by_je_id ? { result: "reversed" } : null;
}

async function executeSourceReversalOnClient(client, input, actor, currentBusinessDate) {
  const original = await getPostingBySource(client, input.operating_company_id, sourceType, sourceId, "initial_post");
  const existingReversal = await getPostingBySource(client, input.operating_company_id, sourceType, sourceId, "reversal");
  if (existingReversal) return existingReversal;
  const crossMechanismReversal = await findCrossMechanismReversal(client, input.operating_company_id, original);
  if (crossMechanismReversal) return crossMechanismReversal;
  const originalLines = await client.query("SELECT ...");
}
  `;
  const regressedNoHelper = good.replace(
    /async function findCrossMechanismReversal[\s\S]*?\n}\n\n/,
    ""
  ).replace(
    "const crossMechanismReversal = await findCrossMechanismReversal(client, input.operating_company_id, original);\n  if (crossMechanismReversal) return crossMechanismReversal;\n  ",
    ""
  );
  const regressedNoCall = good.replace(
    "  const crossMechanismReversal = await findCrossMechanismReversal(client, input.operating_company_id, original);\n  if (crossMechanismReversal) return crossMechanismReversal;\n",
    ""
  );
  const regressedWrongOrder = good.replace(
    `  if (existingReversal) return existingReversal;
  const crossMechanismReversal = await findCrossMechanismReversal(client, input.operating_company_id, original);
  if (crossMechanismReversal) return crossMechanismReversal;
  const originalLines = await client.query("SELECT ...");`,
    `  if (existingReversal) return existingReversal;
  const originalLines = await client.query("SELECT ...");
  const crossMechanismReversal = await findCrossMechanismReversal(client, input.operating_company_id, original);
  if (crossMechanismReversal) return crossMechanismReversal;`
  );

  const checks = [
    ["fully-fixed shape produces zero failures", check(good).length === 0],
    ["removing the helper function is caught", check(regressedNoHelper).some((f) => f.includes("findCrossMechanismReversal not found"))],
    ["removing the call site is caught", check(regressedNoCall).some((f) => f.includes("no longer calls findCrossMechanismReversal"))],
    ["reordering the check to run after reversal-building begins is caught", check(regressedWrongOrder).some((f) => f.includes("called AFTER reversal-building"))],
    ["real repo file currently satisfies this guard (no args = real file)", check().length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = check();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — executeSourceReversalOnClient recognizes a cross-mechanism reversal before attempting a duplicate`);
}
