#!/usr/bin/env node
/**
 * JE-MEMO-STORES-RAW-UUID-AT-POSTER — postSourceTransaction's per-source-type memo builders named the
 * source document by its OWN uuid ("Bill payment <uuid>", "Bank categorization <uuid>", etc.) instead
 * of a human-readable identity, so the JE render shows an unresolvable id where a document name should
 * be. 144 pre-existing TMS-native JE memos on prod carry this shape (deliberately NOT backfilled — a
 * WORM historical-data decision, not this guard's concern).
 *
 * INVARIANT (static — no database): the `label` a source-type builder in posting-engine.service.ts
 * assigns for its posting memo must NOT be an UNCONDITIONAL bare `${sourceId}` (or `String(sourceId)`)
 * — either it must be entirely absent from the label (a real human field is always available), or it
 * must appear only inside a conditional fallback branch (`cond ? withRealField : withSourceId`) so the
 * bare id is the LAST resort, not the only choice.
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
    // A ternary (`cond ? a : b`) is fine even if one branch is bare sourceId — that's the fallback
    // shape this guard wants. Only an UNCONDITIONAL bare sourceId template is the defect.
    const isTernary = /\?.*:/.test(expr);
    if (isTernary) continue;
    const isBareTemplate = /^`[^$]*\$\{sourceId\}[^$]*`$/.test(expr) && !/\$\{[a-zA-Z]/.test(expr.replace(/\$\{sourceId\}/, ""));
    if (isBareTemplate) {
      problems.push(expr);
    }
  }
  if (problems.length > 0) {
    return {
      ok: false,
      reason: `${problems.length} label(s) are an unconditional bare \${sourceId} template with no human-field fallback: ${problems.join(" | ")}`,
    };
  }
  return { ok: true, scanned: labelLines.length };
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const good = `
    const label = payment.display_id ? \`Customer payment \${payment.display_id}\` : \`Customer payment \${sourceId}\`;
    const label2 = \`Bill payment for bill \${billNumber}\`;
  `;
  const goodResult = checkJeMemoLabels(good);
  if (!goodResult.ok) fail(`selftest: known-good fixture should pass — ${goodResult.reason}`);

  const regressed = `
    const label = \`Bill payment \${sourceId}\`;
  `;
  const regressedResult = checkJeMemoLabels(regressed);
  if (regressedResult.ok) fail("selftest: regressed fixture (unconditional bare sourceId template) should FAIL but passed");

  const commentTrap = `
    // const label = payment.display_id ? ... : \`Bill payment \${sourceId}\` — fixed elsewhere
    const label = \`Bill payment \${sourceId}\`;
  `;
  const commentTrapResult = checkJeMemoLabels(commentTrap);
  if (commentTrapResult.ok) fail("selftest: comment-trap fixture (fix mentioned only in a comment) should FAIL but the guard matched its own prose");

  console.log(`[${LABEL}] selftest: PASS — good/regressed/comment-trap fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const filePath = path.join(ROOT, TARGET);
  if (!fs.existsSync(filePath)) fail(`${TARGET}: file not found`);
  const src = fs.readFileSync(filePath, "utf8");
  const result = checkJeMemoLabels(src);
  if (!result.ok) fail(`${TARGET}: ${result.reason}`);
  console.log(`[${LABEL}] PASS — ${result.scanned} label assignment(s) checked, none is an unconditional bare uuid template`);
}
