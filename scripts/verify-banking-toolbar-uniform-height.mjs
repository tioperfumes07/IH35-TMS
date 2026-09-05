#!/usr/bin/env node
// B.2 (owner order 2026-09-05, docs/bus/CODER-SEQUENCE-NUMBERED-2026-09-05.md CC-2 §5): the banking
// transactions toolbar had a measured h-7 (28px) / h-8 (32px) mix across its controls, a single-
// select transaction-type filter, and a date range hidden behind a click. This guard pins the fix:
//
//   1. Every toolbar control (description filter, amount toggle, date range, collapse-groupings,
//      grouping toggle incl. "Money in/out", type filter, categorize-by, pagination, view settings,
//      export) is h-7 (28px) — zero `h-8`/`h-9` literals inside the toolbar's source block.
//   2. The transaction TYPE filter is multi-select (checkboxes), not a single-select control bound
//      to one string value.
//   3. The date range (tx-date-from / tx-date-to) renders unconditionally — visible on landing, not
//      gated behind a `showDateFilterMenu ?` (or similar) conditional.
//
// node scripts/verify-banking-toolbar-uniform-height.mjs
// node scripts/verify-banking-toolbar-uniform-height.mjs --selftest
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-toolbar-uniform-height";
const FILE = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";
// Bounds the "toolbar" to the actual filter/action row — from the review-tabs container through the
// export/print menu button — so a height literal elsewhere in this large file (e.g. a per-row action
// button, a modal, a match-candidates pane) is out of scope and cannot cause a false positive here.
const TOOLBAR_START_MARKER = 'BANKING_REVIEW_TABS.map((tab) => {';
const TOOLBAR_END_MARKER = "<Download";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const raw = readRel(root, FILE);
  if (!raw) {
    problems.push(`missing ${FILE}`);
    return problems;
  }
  const masked = maskComments(raw);
  const startIdx = masked.indexOf(TOOLBAR_START_MARKER);
  const endIdx = masked.indexOf(TOOLBAR_END_MARKER, startIdx >= 0 ? startIdx : 0);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    problems.push(`${FILE}: could not locate the toolbar block (markers moved) — update this guard's markers`);
    return problems;
  }
  const toolbar = masked.slice(startIdx, endIdx);

  if (/\bh-8\b|\bh-9\b/.test(toolbar)) {
    problems.push(`${FILE}: toolbar has a control off the uniform h-7 (28px) height — found h-8/h-9`);
  }
  if (!/type="checkbox"/.test(toolbar)) {
    problems.push(`${FILE}: transaction type filter must be multi-select (checkboxes), none found in the toolbar`);
  }
  // Regression sentinel for the exact old control this replaced.
  if (/<SelectCombobox\s*\n?\s*value=\{selectedTransactionType\}/.test(toolbar)) {
    problems.push(`${FILE}: transaction type filter must not be the old single-select SelectCombobox`);
  }
  // The date inputs must render OUTSIDE any `showDateFilterMenu ? ( ... ) : null` conditional —
  // i.e. before that conditional opens, not nested inside it.
  const dateFromIdx = toolbar.indexOf('id="tx-date-from"');
  const menuCondIdx = toolbar.indexOf("showDateFilterMenu ?");
  if (dateFromIdx < 0) {
    problems.push(`${FILE}: date range "From" field (tx-date-from) not found in the toolbar`);
  } else if (menuCondIdx >= 0 && dateFromIdx > menuCondIdx) {
    problems.push(`${FILE}: date range must render unconditionally (visible on landing), not inside the presets-menu conditional`);
  }
  return problems;
}

function fail(messages) {
  console.error(`${LABEL} FAIL:`);
  for (const m of messages) console.error(`  - ${m}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) fail(baseline);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "banking-toolbar-height-guard-"));
  try {
    const tmpDir = path.join(tmpRoot, path.dirname(FILE));
    fs.mkdirSync(tmpDir, { recursive: true });
    // Planted stub reproduces the exact pre-fix defect shape: mixed height, single-select type
    // filter, date range hidden behind a click.
    const stub = `
      ${TOOLBAR_START_MARKER}
      <button className="h-8 rounded-sm">x</button>
      <SelectCombobox
        value={selectedTransactionType}
        onChange={() => {}}
      />
      {showDateFilterMenu ? (
        <DatePicker id="tx-date-from" />
      ) : null}
      ${TOOLBAR_END_MARKER}
    `;
    fs.writeFileSync(path.join(tmpRoot, FILE), stub);
    const planted = collectProblems(tmpRoot);
    if (planted.length !== 4) {
      console.error(
        `${LABEL} SELFTEST FAIL: expected 4 problems on the planted pre-fix stub, got ${planted.length}: ${JSON.stringify(planted)}`
      );
      process.exit(1);
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length > 0) fail(problems);
  console.log(`${LABEL} OK — banking toolbar uniform h-7, multi-select type filter, date range visible on landing`);
}
