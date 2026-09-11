#!/usr/bin/env node
/**
 * UI-BACK-BUTTON audit wave 2 — owner report (2026-08-25): "many leafs or tabs are missing the back
 * arrow return button. make sure that those that have it take you back to the correct module."
 *
 * A systemwide route-manifest audit (every routed page resolved to its ACTUAL rendered header, not
 * just a per-file grep) found two more defects beyond the first wave's two PageHeader components:
 *
 * 1. WRONG-DESTINATION: components/layout/BackArrowHeader.tsx (the third back-button component in
 *    the app -- backs the whole catalog-list-page family, ~35+ direct + delegated pages) was a plain
 *    <Link to={backTo}>, always returning to the same hardcoded parent regardless of where the user
 *    actually came from -- same defect class as the first wave's two PageHeader components.
 * 2. MISSING ENTIRELY: pages/accounting/AccountingSubNavWrapper.tsx (the module header for every one
 *    of the ~49 routed /accounting/* pages -- the whole Accounting module) had NO back control at
 *    all. Confirmed by resolving all ~400 unique routed leaf files to their real rendered header
 *    (following one level of thin-wrapper delegation), not a shallow per-file grep.
 *
 * Both are now wired to the same lib/smart-back.ts hasInAppHistory signal as the first wave. This
 * guard asserts both wiring sites stay correct and aren't quietly reverted.
 */
import fs from "node:fs";

const BACK_ARROW_HEADER = "apps/frontend/src/components/layout/BackArrowHeader.tsx";
const ACCOUNTING_WRAPPER = "apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx";
// REG-007 (Cursor 2026-09-10) — the last 4 unconditional navigate(-1) sites migrated to smart-back.
const REG007_FILES = [
  "apps/frontend/src/components/shared/BackButton.tsx",
  "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx",
  "apps/frontend/src/pages/accounting/bills/RecurringBillCreate.tsx",
];

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function auditImportsHelper(file, source) {
  const failures = [];
  const stripped = stripComments(source);
  if (!/import\s*\{\s*hasInAppHistory\s*\}\s*from\s*["'][./]*lib\/smart-back["']/.test(stripped)) {
    failures.push(`${file}: must import hasInAppHistory from the shared smart-back helper`);
  }
  if (!/hasInAppHistory\(window\.history\.state\)/.test(stripped)) {
    failures.push(`${file}: back-button handler must call hasInAppHistory(window.history.state)`);
  }
  return { failures, stripped };
}

function auditBackArrowHeader(source) {
  const { failures, stripped } = auditImportsHelper(BACK_ARROW_HEADER, source);
  const historyIdx = stripped.indexOf("hasInAppHistory(window.history.state)");
  const fallbackIdx = stripped.indexOf("navigate(backTo)");
  if (historyIdx < 0 || fallbackIdx < 0 || historyIdx > fallbackIdx) {
    failures.push(
      `${BACK_ARROW_HEADER}: the hasInAppHistory check must run BEFORE the navigate(backTo) fallback, or backTo always wins`
    );
  }
  if (!/<span>Back<\/span>/.test(stripped)) {
    failures.push(`${BACK_ARROW_HEADER}: must show a visible Back label (not icon-only)`);
  }
  return failures;
}

function auditAccountingWrapper(source) {
  const { failures, stripped } = auditImportsHelper(ACCOUNTING_WRAPPER, source);
  if (!/aria-label=["']Back["']/.test(stripped)) {
    failures.push(`${ACCOUNTING_WRAPPER}: must render a back control (aria-label="Back") -- it was missing entirely`);
  }
  if (!/<span>Back<\/span>/.test(stripped)) {
    failures.push(`${ACCOUNTING_WRAPPER}: must show a visible Back label (not icon-only)`);
  }
  const historyIdx = stripped.indexOf("hasInAppHistory(window.history.state)");
  const fallbackIdx = stripped.indexOf('navigate("/home")');
  if (historyIdx < 0 || fallbackIdx < 0 || historyIdx > fallbackIdx) {
    failures.push(
      `${ACCOUNTING_WRAPPER}: the hasInAppHistory check must run BEFORE the /home fallback, or the fallback always wins`
    );
  }
  return failures;
}

// REG-007 — each migrated file must import + call hasInAppHistory and carry NO unconditional
// `navigate(-1)` back handler (`onClick={() => navigate(-1)}`) left behind.
function auditReg007(file, source) {
  const { failures, stripped } = auditImportsHelper(file, source);
  if (/onClick=\{\(\)\s*=>\s*navigate\(-1\)\}/.test(stripped)) {
    failures.push(`${file}: still has an unconditional onClick={() => navigate(-1)} — migrate it to the hasInAppHistory smart-back pattern`);
  }
  return failures;
}

const backArrowSource = fs.readFileSync(BACK_ARROW_HEADER, "utf8");
const accountingSource = fs.readFileSync(ACCOUNTING_WRAPPER, "utf8");

let failures = [...auditBackArrowHeader(backArrowSource), ...auditAccountingWrapper(accountingSource)];
for (const f of REG007_FILES) failures.push(...auditReg007(f, fs.readFileSync(f, "utf8")));

if (failures.length) {
  console.error(`verify-backarrowheader-and-accounting-back-wired FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    {
      name: "remove hasInAppHistory import from BackArrowHeader",
      target: "backArrow",
      mutate: (t) => t.replace('import { hasInAppHistory } from "../../lib/smart-back";\n', ""),
    },
    {
      name: "reorder BackArrowHeader so navigate(backTo) runs first (dead-code the fix)",
      target: "backArrow",
      mutate: (t) =>
        t.replace(
          `if (hasInAppHistory(window.history.state)) {
              navigate(-1);
              return;
            }
            navigate(backTo);`,
          `navigate(backTo);
            if (hasInAppHistory(window.history.state)) {
              navigate(-1);
              return;
            }`
        ),
    },
    {
      name: "remove the back button from AccountingSubNavWrapper entirely",
      target: "accounting",
      mutate: (t) =>
        t.replace(
          /<button\s+type="button"\s+aria-label="Back"[\s\S]*?<\/button>/,
          ""
        ),
    },
    {
      name: "strip visible Back label from BackArrowHeader (icon-only regression)",
      target: "backArrow",
      mutate: (t) => t.replace("<span>Back</span>", ""),
    },
    {
      name: "strip visible Back label from AccountingSubNavWrapper (icon-only regression)",
      target: "accounting",
      mutate: (t) => t.replace("<span>Back</span>", ""),
    },
    {
      name: "reorder AccountingSubNavWrapper so the /home fallback runs first",
      target: "accounting",
      mutate: (t) =>
        t.replace(
          `if (hasInAppHistory(window.history.state)) {
                navigate(-1);
                return;
              }
              navigate("/home");`,
          `navigate("/home");
              if (hasInAppHistory(window.history.state)) {
                navigate(-1);
                return;
              }`
        ),
    },
  ];
  let caught = 0;
  for (const { name, target, mutate } of mutations) {
    let mBackArrow = backArrowSource;
    let mAccounting = accountingSource;
    if (target === "backArrow") mBackArrow = mutate(backArrowSource);
    if (target === "accounting") mAccounting = mutate(accountingSource);

    const changed = mBackArrow !== backArrowSource || mAccounting !== accountingSource;
    if (!changed) throw new Error(`mutation "${name}" did not change any source -- test is inert`);

    const mutFailures = [...auditBackArrowHeader(mBackArrow), ...auditAccountingWrapper(mAccounting)];
    if (mutFailures.length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  // REG-007 mutations: each migrated file must fail if its smart-back import is stripped or a bare
  // navigate(-1) handler is reintroduced.
  let reg007Caught = 0;
  const reg007Mutations = [];
  for (const f of REG007_FILES) {
    const src = fs.readFileSync(f, "utf8");
    reg007Mutations.push({ name: `strip smart-back import from ${f}`, file: f, mutate: (t) => t.replace(/import\s*\{\s*hasInAppHistory\s*\}\s*from\s*["'][./]*lib\/smart-back["'];?\n/, "") });
    reg007Mutations.push({ name: `reintroduce bare navigate(-1) in ${f}`, file: f, mutate: (t) => `${t}\n<button onClick={() => navigate(-1)} />` });
  }
  for (const { name, file, mutate } of reg007Mutations) {
    const orig = fs.readFileSync(file, "utf8");
    const mutated = mutate(orig);
    if (mutated === orig) throw new Error(`REG-007 mutation "${name}" did not change source — inert`);
    if (auditReg007(file, mutated).length === 0) throw new Error(`REG-007 mutation escaped: "${name}"`);
    reg007Caught += 1;
  }
  console.log(`verify-backarrowheader-and-accounting-back-wired SELFTEST PASS — ${caught}/${mutations.length} + REG-007 ${reg007Caught}/${reg007Mutations.length} mutations detected`);
}

console.log(
  "verify-backarrowheader-and-accounting-back-wired PASS — BackArrowHeader + AccountingSubNavWrapper smart-back and visible Back label"
);
