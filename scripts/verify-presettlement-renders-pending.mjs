#!/usr/bin/env node
// ROUND 167 (owner, verbatim, 2026-09-28): "FOR THE CURRENT LOADS WRITE PENDING SETTLEMENT NUMBER
// WHILE WE FINISH." A load in flight has no settlement number -- it has a PENDING one. "THERE IS
// NO SETTLEMENT 001, 003, 005, 007" -- P-series display_ids (P-0001, P-0014...) are pre-settlement
// row ids, never a settlement number, and must never render as if they were one. "Open" is retired
// as a settlementLabel() output -- it described a status, not a number.
//
// Static source-pattern guard on lib/settlementNumber.ts: fails if settlementLabel() no longer
// branches on is_presettlement before falling through to settlementNumber(), or if the retired
// "Open" string literal reappears as a return value.
export const ALLOW_OFFLINE_SKIP =
  "pure static source-text scan of settlementNumber.ts -- never connects to a database.";

import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-presettlement-renders-pending";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FILE = path.join(ROOT, "apps/frontend/src/lib/settlementNumber.ts");

export function checkFile(src) {
  const problems = [];
  const fnMatch = src.match(/export function settlementLabel[\s\S]*?\n\s*\}/);
  if (!fnMatch) {
    problems.push("settlementLabel() not found.");
    return problems;
  }
  const fn = fnMatch[0];
  if (!/is_presettlement\s*===\s*true/.test(fn)) {
    problems.push('settlementLabel() no longer checks is_presettlement === true -- a pre-settlement row must render "PENDING", never a number or a P-series id.');
  }
  if (!/return\s*"PENDING"/.test(fn)) {
    problems.push('settlementLabel() does not return "PENDING" for a pre-settlement row.');
  }
  if (/"Open"/.test(fn)) {
    problems.push('settlementLabel() still returns the retired "Open" label -- "Open" describes a status, not a settlement number.');
  }
  if (!/is_presettlement\?:\s*boolean \| null/.test(src)) {
    problems.push("is_presettlement is not declared on the shared CommonFields shape (SettlementNumberSource callers need it to type-check).");
  }
  return problems;
}

function selftest() {
  let bad = 0;
  const t = (name, cond) => {
    if (!cond) {
      console.error(`  SELFTEST FAIL: ${name}`);
      bad++;
    }
  };
  const GOOD = `
    type CommonFields = { is_presettlement?: boolean | null; };
    export function settlementLabel(row) {
      const r = row;
      if (r?.is_presettlement === true || isOpenSettlement(row)) return "PENDING";
      return settlementNumber(row) ?? "—";
    }
  `;
  const BAD_NO_CHECK = `
    type CommonFields = { is_presettlement?: boolean | null; };
    export function settlementLabel(row) {
      return settlementNumber(row) ?? "—";
    }
  `;
  const BAD_STILL_OPEN = `
    type CommonFields = { is_presettlement?: boolean | null; };
    export function settlementLabel(row) {
      const r = row;
      if (r?.is_presettlement === true) return "PENDING";
      return settlementNumber(row) ?? (isOpenSettlement(row) ? "Open" : "—");
    }
  `;
  const BAD_NO_FIELD = `
    export function settlementLabel(row) {
      const r = row;
      if (r?.is_presettlement === true || isOpenSettlement(row)) return "PENDING";
      return settlementNumber(row) ?? "—";
    }
  `;
  t("clean source passes", checkFile(GOOD).length === 0);
  t("missing is_presettlement check fails", checkFile(BAD_NO_CHECK).length >= 1);
  t('retired "Open" label fails', checkFile(BAD_STILL_OPEN).length >= 1);
  t("missing CommonFields declaration fails", checkFile(BAD_NO_FIELD).length >= 1);
  t("empty source fails", checkFile("").length >= 1);

  if (bad > 0) {
    console.log(`${LABEL} SELFTEST FAILED (${bad})`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  if (!fs.existsSync(FILE)) {
    console.error(`${LABEL}: FAIL — ${path.relative(ROOT, FILE)} does not exist.`);
    process.exit(1);
  }
  const problems = checkFile(fs.readFileSync(FILE, "utf8"));
  if (problems.length > 0) {
    console.error(`${LABEL}: FAIL — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — settlementLabel() renders "PENDING" for is_presettlement rows and no longer returns the retired "Open" label.`);
}

main();
