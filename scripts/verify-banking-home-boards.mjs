#!/usr/bin/env node
/**
 * Pending row 38 — Banking › Home bare panels → BoardSection (fill-not-shell).
 * Honesty banners stay outside BoardSection.
 *
 *   node scripts/verify-banking-home-boards.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-home-boards";
const FILE = "apps/frontend/src/pages/banking/BankingHome.tsx";
function audit(read) {
  const src = read(FILE);
  const fails = [];

  if (!src.includes('from "../../components/v3/BoardSection"')) {
    fails.push(`${FILE}: must import BoardSection`);
  }
  for (const testId of [
    "banking-home-accounts-board",
    "banking-home-factoring-virtual-board",
    "bank-account-inspect-board",
    "banking-home-relay-board",
    "banking-home-statement-import-board",
    "banking-home-plaid-board",
    "banking-home-settings-board",
  ]) {
    const re = new RegExp(
      `<BoardSection[\\s\\S]{0,260}testId=["']${testId}["']`,
    );
    if (!re.test(src))
      fails.push(`${FILE}: missing BoardSection testId=${testId}`);
  }
  for (const keep of [
    'data-testid="bank-account-inspect-panel"',
    'data-testid="banking-relay-tab"',
    "BankingHomeBoard",
    "reorderBankAccounts",
    "StatementUpload",
    "FORM_SELECT_CLASS",
  ]) {
    if (!src.includes(keep)) fails.push(`${FILE}: must keep ${keep}`);
  }
  return fails;
}

/** Planted-defect selftest: each mutation is applied to the REAL source of one surface and must be caught. */
function selftest(mutations) {
  const clean = audit(readReal);
  if (clean.length) {
    console.error(
      `${LABEL} SELFTEST FAILED — real sources must pass before planting:\n  - ${clean.join("\n  - ")}`,
    );
    process.exit(1);
  }
  const missed = [];
  for (const m of mutations) {
    const original = readReal(m.file);
    const mutated = m.mutate(original);
    if (mutated === original) {
      missed.push(
        `${m.name}: mutation did not change ${m.file} (stale fixture)`,
      );
      continue;
    }
    const got = audit((rel) => (rel === m.file ? mutated : readReal(rel)));
    if (!got.some((f) => f.includes(m.expect)))
      missed.push(
        `${m.name}: NOT caught (got: ${got.join(" | ") || "no failures"})`,
      );
  }
  if (missed.length) {
    console.error(
      `${LABEL} SELFTEST FAILED — ${mutations.length - missed.length}/${mutations.length} planted defects caught:\n  - ${missed.join("\n  - ")}`,
    );
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects caught`,
  );
  process.exit(0);
}

const readReal = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
if (process.argv.includes("--selftest")) {
  selftest([
    {
      name: "BoardSection import dropped",
      file: FILE,
      expect: "must import BoardSection",
      mutate: (src) =>
        src
          .split('from "../../components/v3/BoardSection"')
          .join('from "../../components/v3/Gone"'),
    },
    {
      name: "accounts board testId removed",
      file: FILE,
      expect: "testId=banking-home-accounts-board",
      mutate: (src) =>
        src
          .split("banking-home-accounts-board")
          .join("banking-home-accounts-gone"),
    },
    {
      name: "Plaid board testId removed",
      file: FILE,
      expect: "testId=banking-home-plaid-board",
      mutate: (src) =>
        src.split("banking-home-plaid-board").join("banking-home-plaid-gone"),
    },
    {
      name: "reorder engine removed",
      file: FILE,
      expect: "must keep reorderBankAccounts",
      mutate: (src) => src.split("reorderBankAccounts").join("reorderGone"),
    },
  ]);
}

const fails = audit(readReal);

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Banking Home tab panels use BoardSection`);
