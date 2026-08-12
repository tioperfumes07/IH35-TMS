#!/usr/bin/env node
/**
 * CLS-LINKAGE-ONEWAY instance (Invoice -> JE, revenue-linkage drill payload) — static ratchet.
 *
 * apps/backend/src/home/revenue-gl-linkage.service.ts powers the Office HOME revenue-vs-GL
 * reconciliation drill-through: `drill.mismatched_journal_entries` is the exact list the owner works
 * from to investigate a GL discrepancy. accounting.journal_entries has no number/ref/doc column;
 * `memo` IS the JE's human identity. Two separate gaps existed here:
 *
 *   1. The `linked_postings` CTE already joined `accounting.journal_entries je` (for entry_date/
 *      status) but never carried `je.memo` into its own output columns — so the outer query had
 *      nothing to select even though `je` was in scope.
 *   2. `unlinkedGlRes`'s SQL DID select `je.memo`, but the JS mapper that builds each
 *      `RevenueJournalDrill` object never read `row.memo` — the data reached the app process and was
 *      dropped before the payload.
 *
 * INVARIANT (static — no database): every `mismatchedJournals.push({...})` call site in this file
 * must include a `memo` field, and the `RevenueJournalDrill` type must declare `memo`.
 *
 * Self-test: node scripts/verify-revenue-gl-linkage-je-memo.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-revenue-gl-linkage-je-memo";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TARGET = "apps/backend/src/home/revenue-gl-linkage.service.ts";

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

export function checkRevenueGlLinkageJeMemo(src) {
  const code = stripComments(src);

  const typeMatch = /type RevenueJournalDrill = \{([^}]*)\}/.exec(code);
  if (!typeMatch) return { ok: false, reason: "RevenueJournalDrill type not found" };
  if (!/\bmemo\s*:/.test(typeMatch[1])) {
    return { ok: false, reason: "RevenueJournalDrill type does not declare a memo field" };
  }

  const pushCalls = [...code.matchAll(/mismatchedJournals\.push\(\{([^}]*)\}\)/gs)];
  if (pushCalls.length === 0) {
    return { ok: false, reason: "no mismatchedJournals.push({...}) call sites found — matcher is inert" };
  }
  const missing = pushCalls.filter((m) => !/\bmemo\s*:/.test(m[1]));
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `${missing.length} of ${pushCalls.length} mismatchedJournals.push({...}) call site(s) do not set memo`,
    };
  }

  return { ok: true, scanned: pushCalls.length };
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const good = `
    type RevenueJournalDrill = {
      journal_entry_id: string;
      memo: string | null;
      entry_date: string;
    };
    mismatchedJournals.push({
      journal_entry_id: jeId,
      memo: link.memo ?? null,
      entry_date: link.entry_date,
    });
    mismatchedJournals.push({
      journal_entry_id: row.journal_entry_id,
      memo: row.memo ?? null,
      entry_date: row.entry_date,
    });
  `;
  const goodResult = checkRevenueGlLinkageJeMemo(good);
  if (!goodResult.ok) fail(`selftest: known-good fixture should pass — ${goodResult.reason}`);

  const regressedTypeMissing = good.replace(/\s*memo: string \| null;\n/, "\n");
  const regressedTypeResult = checkRevenueGlLinkageJeMemo(regressedTypeMissing);
  if (regressedTypeResult.ok) fail("selftest: regressed fixture (type missing memo) should FAIL but passed");

  const regressedOnePushMissing = good.replace(/\s*memo: row\.memo \?\? null,\n/, "\n");
  const regressedPushResult = checkRevenueGlLinkageJeMemo(regressedOnePushMissing);
  if (regressedPushResult.ok) fail("selftest: regressed fixture (one push site missing memo) should FAIL but passed");

  const commentTrap = good.replace(
    "mismatchedJournals.push({\n      journal_entry_id: row.journal_entry_id,\n      memo: row.memo ?? null,\n      entry_date: row.entry_date,\n    });",
    "// TODO: memo: row.memo ?? null\n    mismatchedJournals.push({\n      journal_entry_id: row.journal_entry_id,\n      entry_date: row.entry_date,\n    });"
  );
  const commentTrapResult = checkRevenueGlLinkageJeMemo(commentTrap);
  if (commentTrapResult.ok) fail("selftest: comment-trap fixture (fix mentioned only in a comment) should FAIL but the guard matched its own prose");

  console.log(`[${LABEL}] selftest: PASS — good/regressed(type)/regressed(one-site)/comment-trap fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const filePath = path.join(ROOT, TARGET);
  if (!fs.existsSync(filePath)) fail(`${TARGET}: file not found`);
  const src = fs.readFileSync(filePath, "utf8");
  const result = checkRevenueGlLinkageJeMemo(src);
  if (!result.ok) fail(`${TARGET}: ${result.reason}`);
  console.log(`[${LABEL}] PASS — ${result.scanned} mismatchedJournals.push() site(s) carry memo, RevenueJournalDrill declares it`);
}
