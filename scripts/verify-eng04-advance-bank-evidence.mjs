#!/usr/bin/env node
/**
 * ACCT-F11091 (ENG-04, register row 110) — the 2170 advance-reclass evidence must come from LIVE,
 * UNCLAIMED bank lines, one bank line per advance.
 *
 * DEFECT (measured prod 2026-11-03): the dry-run behind the owner's $705.97 AUTH item (row 43)
 * classified CA-2026-0004 as BANK_UNIQUE on 9abf2596 (voided pending line, merged into 6198ea2f) and
 * CA-2026-0006 + CA-2026-0007 as BANK_UNIQUE on the SAME line f5cc2ced (voided pending line). With
 * the rules applied, 0004 has 2 live candidates and 0006/0007 share 2 live candidates — none is unique.
 *
 * Checks:
 *   1. the dry-run imports classifyAdvanceBankEvidence and carries no inline amount/window match SQL;
 *   2. the classifier, run on the measured 2026-11-03 fixture, never returns BANK_UNIQUE for a voided,
 *      merged, inflow or already-matched line, dates by posted_date ?? transaction_date, and never
 *      lets one line be unique evidence for two advances.
 *
 * Usage: node scripts/verify-eng04-advance-bank-evidence.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import { classifyAdvanceBankEvidence } from "./lib/eng04-advance-bank-evidence.mjs";

const LABEL = "verify-eng04-advance-bank-evidence";
const DRY_RUN = "scripts/ops/2026-10-26-eng-04-2170-advance-reclass-dry-run.mts";

// Measured on prod 2026-11-03 (USMCA). Ledger ids are placeholders — only the classification matters.
const BOOK = "2026-10-11";
export const FIXTURE_ADVANCES = [
  { advance_id: "eab601eb", display_id: "CA-2026-0004", amount_cents: 30199, book_date: BOOK },
  { advance_id: "9c0f614c", display_id: "CA-2026-0005", amount_cents: 15199, book_date: BOOK },
  { advance_id: "e25ae26f", display_id: "CA-2026-0006", amount_cents: 20199, book_date: BOOK },
  { advance_id: "03623f39", display_id: "CA-2026-0007", amount_cents: 20199, book_date: BOOK },
];
const L = (id, amount_cents, posted_date, transaction_date, extra = {}) => ({
  id, amount_cents, posted_date, transaction_date, voided_at: null, merged_into_bank_transaction_id: null,
  already_matched: false, bank_ledger_account_id: "gl-1000", bank_ledger_number: "1000", ...extra,
});
export const FIXTURE_LINES = [
  L("9abf2596", -30199, "2026-10-10", "2026-10-11", { voided_at: "2026-10-15", merged_into_bank_transaction_id: "6198ea2f" }),
  L("6198ea2f", -30199, null, "2026-10-13"),
  L("80c36ce2", -30199, null, "2026-09-29"),
  L("f5cc2ced", -20199, "2026-09-21", "2026-09-21", { voided_at: "2026-11-03" }),
  L("59d3c6d8", -20199, null, "2026-09-22"),
  L("f404c48d", -20199, null, "2026-09-29"),
  L("29f3c45b", -15199, "2026-10-09", "2026-10-09", { voided_at: "2026-10-15" }),
  L("ac1cdeb4", -15199, "2026-10-09", "2026-10-10", { voided_at: "2026-10-15" }),
  L("762a285b", -15199, null, "2026-10-13"),
];
export const EXPECTED = {
  "CA-2026-0004": "BANK_AMBIGUOUS",
  "CA-2026-0005": "BANK_UNIQUE",
  "CA-2026-0006": "BANK_AMBIGUOUS",
  "CA-2026-0007": "BANK_AMBIGUOUS",
};

export function checkClassifier(classify) {
  const problems = [];
  const run = (advs, lines) => {
    try {
      return classify(advs, lines, { windowDays: 21 });
    } catch (e) {
      problems.push(`classifier threw: ${e.message}`);
      return [];
    }
  };
  for (const r of run(FIXTURE_ADVANCES, FIXTURE_LINES)) {
    if (EXPECTED[r.display_id] !== r.evidence) problems.push(`${r.display_id}: expected ${EXPECTED[r.display_id]}, got ${r.evidence}`);
  }
  const one = [{ advance_id: "a1", display_id: "A1", amount_cents: 100, book_date: BOOK }];
  const planted = [
    ["voided line", L("x", -100, BOOK, BOOK, { voided_at: "2026-10-12" })],
    ["merged line", L("x", -100, BOOK, BOOK, { merged_into_bank_transaction_id: "y" })],
    ["inflow line", L("x", 100, BOOK, BOOK)],
    ["already-matched line", L("x", -100, BOOK, BOOK, { already_matched: true })],
  ];
  for (const [name, line] of planted) {
    const [r] = run(one, [line]);
    if (r?.evidence === "BANK_UNIQUE") problems.push(`${name} accepted as BANK_UNIQUE evidence`);
  }
  const [dated] = run(one, [L("x", -100, null, BOOK)]);
  if (dated?.evidence !== "BANK_UNIQUE") problems.push(`line with posted_date NULL and transaction_date in window not considered (got ${dated?.evidence})`);
  const two = [
    { advance_id: "a1", display_id: "A1", amount_cents: 100, book_date: BOOK },
    { advance_id: "a2", display_id: "A2", amount_cents: 100, book_date: BOOK },
  ];
  for (const r of run(two, [L("x", -100, BOOK, BOOK)])) {
    if (r.evidence === "BANK_UNIQUE") problems.push(`${r.display_id}: one bank line accepted as unique evidence for two advances`);
  }
  return problems;
}

export function checkDryRunSource(src) {
  const problems = [];
  if (!/import\s*\{[^}]*classifyAdvanceBankEvidence[^}]*\}\s*from\s*["']\.\.\/lib\/eng04-advance-bank-evidence\.mjs["']/.test(src))
    problems.push(`${DRY_RUN} does not import classifyAdvanceBankEvidence from ../lib/eng04-advance-bank-evidence.mjs`);
  if (!/classifyAdvanceBankEvidence\(/.test(src)) problems.push(`${DRY_RUN} never calls classifyAdvanceBankEvidence`);
  if (/abs\(\s*bt\.amount_cents\s*\)\s*=\s*adv\.amount_cents/i.test(src) || /posted_date\s+BETWEEN/i.test(src))
    problems.push(`${DRY_RUN} still carries an inline amount/date match in SQL — evidence rules must live in the shared classifier`);
  return problems;
}

function report(problems) {
  if (problems.length) {
    for (const p of problems) console.error(`${LABEL}: FAIL ${p}`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  const ok = checkClassifier(classifyAdvanceBankEvidence).length === 0;
  // Planted defect 1: the original behaviour — no eligibility filter, posted_date only, no exclusivity.
  const legacy = (advs, lines, { windowDays }) =>
    advs.map((a) => {
      const c = lines.filter((l) => Math.abs(l.amount_cents) === a.amount_cents && l.posted_date &&
        Math.abs((Date.parse(l.posted_date) - Date.parse(a.book_date)) / 86400000) <= windowDays);
      return { display_id: a.display_id, evidence: c.length === 0 ? "NO_EVIDENCE" : c.length === 1 ? "BANK_UNIQUE" : "BANK_AMBIGUOUS" };
    });
  // Planted defect 2: filters eligibility but drops the exclusivity rule.
  const noExclusive = (advs, lines, opts) =>
    classifyAdvanceBankEvidence(advs, lines, opts).map((r) => (r.evidence === "BANK_CONTESTED" ? { ...r, evidence: "BANK_UNIQUE" } : r));
  const goodSrc = `import { classifyAdvanceBankEvidence } from "../lib/eng04-advance-bank-evidence.mjs";\nclassifyAdvanceBankEvidence(a, b);`;
  const badSrc = `AND abs(bt.amount_cents) = adv.amount_cents AND bt.posted_date BETWEEN adv.book_date - 21 AND adv.book_date + 21`;
  const cases = [
    ["real classifier passes", ok],
    ["legacy classifier caught", checkClassifier(legacy).length > 0],
    ["no-exclusivity classifier caught", checkClassifier(noExclusive).length > 0],
    ["good dry-run source passes", checkDryRunSource(goodSrc).length === 0],
    ["legacy inline-SQL dry-run caught", checkDryRunSource(badSrc).length > 0],
  ];
  const failed = cases.filter(([, pass]) => !pass);
  for (const [name, pass] of cases) console.log(`${LABEL} selftest: ${pass ? "PASS" : "FAIL"} ${name}`);
  if (failed.length) process.exit(1);
  console.log(`${LABEL} selftest: ${cases.length}/${cases.length} PASS`);
} else {
  const problems = [...checkClassifier(classifyAdvanceBankEvidence), ...checkDryRunSource(readFileSync(DRY_RUN, "utf8"))];
  report(problems);
  console.log(`${LABEL}: PASS — dry-run uses the shared classifier; measured 2026-11-03 fixture: CA-0004/0006/0007 not unique, CA-0005 unique`);
}
