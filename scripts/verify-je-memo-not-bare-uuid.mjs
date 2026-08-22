#!/usr/bin/env node
/**
 * JE-MEMO-STORES-RAW-UUID-AT-POSTER — postSourceTransaction's per-source-type memo builders named the
 * source document by its OWN uuid ("Bill payment <uuid>", "Bank categorization <uuid>", etc.) instead
 * of a human-readable identity, so the JE render shows an unresolvable id where a document name should
 * be. 144 pre-existing TMS-native JE memos on prod carry this shape (deliberately NOT backfilled — a
 * WORM historical-data decision, not this guard's concern).
 *
 * LV-JE-MEMO-RECORD-NOT-VISIBLE (ACCT-F5730/ACCT-F5733) — this guard originally EXEMPTED a ternary
 * fallback (`cond ? withRealField : withSourceId`) as "fine, that's the fallback shape this guard
 * wants." That reasoning is now stale: journal-entries.service.ts's list resolver ties every JE to its
 * source via journal_entry_postings.source_transaction_id/source_transaction_display_id (not memo
 * text), so display no longer depends on the memo carrying an identifier at all — an honest bare noun
 * ("Bill", "Expense", "Customer payment") is strictly better than a raw UUID in ANY branch, including a
 * rare-fallback one. The tightened rule below flags a literal `${sourceId}` interpolation wherever it
 * appears, ternary or not.
 *
 * INVARIANT (static — no database): the `label` a source-type builder in posting-engine.service.ts
 * assigns for its posting memo must NEVER interpolate the bare `${sourceId}` (or `String(sourceId)`)
 * — not unconditionally, and not as a ternary's fallback branch either. The one allowed exception is a
 * SHORT id suffix (`${sourceId.slice(0, 8)}`) used alongside a real human field (type/description) for
 * per-row uniqueness when the source table has no display_id/number column at all (driver
 * reimbursements, bank categorization) — that is a deliberate, already-reviewed design, not this
 * defect class, and is distinguishable because it is never the LITERAL substring `${sourceId}`.
 *
 * Deliberately scoped to the label-construction lines in posting-engine.service.ts (`const label =`),
 * not a repo-wide memo scan — that would need real SQL/JS parsing to avoid false positives on
 * unrelated `label` variables elsewhere.
 *
 * Self-test: node scripts/verify-je-memo-not-bare-uuid.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-je-memo-not-bare-uuid";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TARGET = "apps/backend/src/accounting/posting-engine.service.ts";

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

export function checkJeMemoLabels(src) {
  const code = stripComments(src);
  const labelLines = [...code.matchAll(/^\s*const label(?:: string)? = ([^\n]+?);?\s*$/gm)].map((m) => m[1].trim());
  if (labelLines.length === 0) return { ok: false, reason: "no `const label = ...` assignments found — matcher is inert" };

  const problems = [];
  for (const expr of labelLines) {
    // LV-JE-MEMO-RECORD-NOT-VISIBLE — the literal substring `${sourceId}` (exact interpolation, no
    // method call after it) is the defect ANYWHERE it appears, ternary fallback branch or not. A short
    // suffix like `${sourceId.slice(0, 8)}` does NOT match this substring (there is more than
    // `sourceId` before the closing brace), so the deliberate short-suffix exception stays allowed.
    const hasBareSourceIdInterpolation = /\$\{sourceId\}/.test(expr);
    if (hasBareSourceIdInterpolation) {
      problems.push(expr);
    }
  }
  if (problems.length > 0) {
    return {
      ok: false,
      reason: `${problems.length} label(s) interpolate the bare \${sourceId} (a raw uuid) somewhere — unconditionally or as a ternary fallback: ${problems.join(" | ")}`,
    };
  }
  return { ok: true, scanned: labelLines.length };
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const good = `
    const label = payment.display_id ? \`Customer payment \${payment.display_id}\` : "Customer payment";
    const label2 = \`Bill payment for bill \${billNumber}\`;
    const label3 = reimb.reimbursement_type
      ? \`Driver reimbursement (\${reimb.reimbursement_type}) \${sourceId.slice(0, 8)}\`
      : \`Driver reimbursement \${sourceId.slice(0, 8)}\`;
  `;
  const goodResult = checkJeMemoLabels(good);
  if (!goodResult.ok) fail(`selftest: known-good fixture should pass — ${goodResult.reason}`);

  const regressed = `
    const label = \`Bill payment \${sourceId}\`;
  `;
  const regressedResult = checkJeMemoLabels(regressed);
  if (regressedResult.ok) fail("selftest: regressed fixture (unconditional bare sourceId template) should FAIL but passed");

  // LV-JE-MEMO-RECORD-NOT-VISIBLE — the class this guard originally missed: a ternary whose FALLBACK
  // branch bakes the literal bare uuid. This used to be explicitly exempted; now it must FAIL.
  const ternaryFallbackRegressed = `
    const label = payment.display_id ? \`Customer payment \${payment.display_id}\` : \`Customer payment \${sourceId}\`;
  `;
  const ternaryFallbackResult = checkJeMemoLabels(ternaryFallbackRegressed);
  if (ternaryFallbackResult.ok) fail("selftest: ternary-fallback-to-bare-sourceId fixture should FAIL but passed (this is the exact class ACCT-F5730/ACCT-F5733 fixed)");

  const commentTrap = `
    // const label = payment.display_id ? ... : \`Bill payment \${sourceId}\` — fixed elsewhere
    const label = \`Bill payment \${sourceId}\`;
  `;
  const commentTrapResult = checkJeMemoLabels(commentTrap);
  if (commentTrapResult.ok) fail("selftest: comment-trap fixture (fix mentioned only in a comment) should FAIL but the guard matched its own prose");

  console.log(`[${LABEL}] selftest: PASS — good/regressed/ternary-fallback-regressed/comment-trap fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const filePath = path.join(ROOT, TARGET);
  if (!fs.existsSync(filePath)) fail(`${TARGET}: file not found`);
  const src = fs.readFileSync(filePath, "utf8");
  const result = checkJeMemoLabels(src);
  if (!result.ok) fail(`${TARGET}: ${result.reason}`);
  console.log(`[${LABEL}] PASS — ${result.scanned} label assignment(s) checked, none interpolates the bare \${sourceId} raw uuid (unconditionally or as a ternary fallback)`);
}
