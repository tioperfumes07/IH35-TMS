#!/usr/bin/env node
/**
 * MOBILE-RESPONSIVE-AUDIT-BASELINE-DRIFT — the `table-no-mobile-fallback` rule in
 * apps/frontend/src/audit/mobile-responsive/auditor.script.mjs matched `<table` against a
 * file's ENTIRE raw content, so a `<table>` embedded inside a backtick template-literal string
 * (e.g. `printLetterHtml({ bodyHtml: \`...<table>...\`\` })`, generating print/PDF-only HTML that
 * is never rendered as live JSX in a browser viewport) tripped the same "no mobile fallback"
 * failure as a genuine on-screen table. This produced 12 false-positive regressions across
 * accounting/banking/finance/home pages on origin/main, none of which have a real on-screen
 * table at all — confirmed by direct read of all 6 CC-1 money-lane files (AccountRegisterPage,
 * AccountsPayableAgingPage, ExpenseDetailPage, ReconciliationWorkspace, ArApAgingPage,
 * FinancialStatementsPage): every single flagged <table> in every file sits inside a
 * printLetterHtml(...) bodyHtml template literal.
 *
 * Fixed by stripping backtick template-literal bodies from the content before testing for
 * <table> — a genuine on-screen JSX <table> outside any template literal still fires normally.
 *
 * This guard locks the fix directly against the rule's own logic (re-implemented inline, since
 * the rule closure isn't separately exported) so a future edit can't silently regress it back to
 * matching raw file content.
 */
import { readFileSync } from "node:fs";

const auditorPath = "apps/frontend/src/audit/mobile-responsive/auditor.script.mjs";
const auditorSrc = readFileSync(auditorPath, "utf8");

// Re-derive the exact rule logic from the shipped file, so this guard tests the REAL behavior,
// not a hand-copied approximation that could drift from what's actually shipped.
function extractTableRuleTest(src) {
  const idIdx = src.indexOf('id: "table-no-mobile-fallback"');
  if (idIdx === -1) return null;
  const arrowStart = src.indexOf("(content, file) => {", idIdx);
  if (arrowStart === -1) return null;
  const bodyOpenBrace = src.indexOf("{", arrowStart);
  let depth = 0;
  let i = bodyOpenBrace;
  for (; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const arrowFnSrc = src.slice(arrowStart, i + 1);
  // eslint-disable-next-line no-new-func
  return new Function(`return (${arrowFnSrc});`)();
}

function analyze() {
  const failures = [];
  const testFn = extractTableRuleTest(auditorSrc);
  if (!testFn) {
    failures.push(`${auditorPath}: could not locate/parse the table-no-mobile-fallback rule's test function`);
    return failures;
  }

  // Case 1: a table embedded in a print-template backtick string must NOT be flagged.
  const printTemplateCase = `
    const x = () => {
      printLetterHtml({
        bodyHtml: \`
          <table>
            <tbody><tr><td>1</td></tr></tbody>
          </table>
        \`,
      });
    };
  `;
  const printResult = testFn(printTemplateCase, "SomePage.tsx");
  if (printResult != null) {
    failures.push(`table-no-mobile-fallback rule still flags a <table> inside a backtick print-template string: "${printResult}"`);
  }

  // Case 2: a genuine on-screen JSX table with NO mobile fallback, outside any template literal,
  // must still be flagged — the fix must not blind the rule entirely.
  const liveJsxCase = `
    export function SomePage() {
      return (
        <div>
          <table>
            <tbody><tr><td>1</td></tr></tbody>
          </table>
        </div>
      );
    }
  `;
  const liveResult = testFn(liveJsxCase, "SomePage.tsx");
  if (liveResult == null) {
    failures.push("table-no-mobile-fallback rule no longer flags a genuine on-screen JSX <table> with no mobile fallback — the fix over-corrected and blinded the rule");
  }

  // Case 3: a genuine on-screen JSX table WITH a mobile fallback (overflow-x-auto) must not be
  // flagged — sanity-checks the negative branch is untouched by this fix.
  const liveJsxWithFallback = `
    export function SomePage() {
      return (
        <div className="overflow-x-auto">
          <table>
            <tbody><tr><td>1</td></tr></tbody>
          </table>
        </div>
      );
    }
  `;
  const fallbackResult = testFn(liveJsxWithFallback, "SomePage.tsx");
  if (fallbackResult != null) {
    failures.push(`table-no-mobile-fallback rule flags a table that DOES have overflow-x-auto: "${fallbackResult}"`);
  }

  return failures;
}

function selftest() {
  const good = analyze();
  if (good.length > 0) {
    console.error("verify-mobile-audit-table-rule-skips-print-templates --selftest: FAIL on the real (good) rule");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  // Mutation: revert the fix (test against raw content instead of stripped content).
  const mutated = auditorSrc.replace(
    'const withoutTemplateLiterals = content.replace(/`(?:[^`\\\\]|\\\\.)*`/gs, "");\n      if (/<table[\\s>]/.test(withoutTemplateLiterals) && !/MobileOptimizedTable|overflow-x-auto|sm:table|md:table/.test(content)) {',
    'if (/<table[\\s>]/.test(content) && !/MobileOptimizedTable|overflow-x-auto|sm:table|md:table/.test(content)) {'
  );
  if (mutated === auditorSrc) {
    console.error("verify-mobile-audit-table-rule-skips-print-templates --selftest: mutation setup failed — anchor not found");
    process.exit(1);
  }
  const testFn = extractTableRuleTest(mutated);
  const printTemplateCase = `
    const x = () => {
      printLetterHtml({
        bodyHtml: \`
          <table>
            <tbody><tr><td>1</td></tr></tbody>
          </table>
        \`,
      });
    };
  `;
  const result = testFn(printTemplateCase, "SomePage.tsx");
  if (result == null) {
    console.error("verify-mobile-audit-table-rule-skips-print-templates --selftest: mutation (revert to raw-content match) was not caught");
    process.exit(1);
  }

  console.log("verify-mobile-audit-table-rule-skips-print-templates --selftest: OK (good rule clean, mutation caught)");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = analyze();
  if (failures.length > 0) {
    console.error("verify-mobile-audit-table-rule-skips-print-templates: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-mobile-audit-table-rule-skips-print-templates: OK — table-no-mobile-fallback skips print-template tables, still catches genuine on-screen JSX tables with no mobile fallback");
}
