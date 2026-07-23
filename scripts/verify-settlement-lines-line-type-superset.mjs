#!/usr/bin/env node
/**
 * WO item 3 — held 202607380000 §5 must be a TRUE LIVE SUPERSET of settlement_lines.line_type.
 * Never ship a narrowing that drops escrow / auto_deduction / dispute_adjustment while adding
 * escrow_contribution.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIG = "db/migrations/202607380000_settlement_payrun_catalog_and_extends.sql";

const REQUIRED = [
  "earnings",
  "extra_pay",
  "reimbursement",
  "deduction",
  "advance_recovery",
  "escrow",
  "abandonment_chargeback",
  "team_split_primary",
  "team_split_secondary",
  "auto_deduction",
  "dispute_adjustment",
  "escrow_contribution",
];

export function run(root = ROOT) {
  const failures = [];
  const p = path.join(root, MIG);
  if (!fs.existsSync(p)) {
    failures.push(`${MIG}: missing`);
    return failures;
  }
  const src = fs.readFileSync(p, "utf8");
  const start = src.indexOf("settlement_lines_line_type_chk_payrun");
  if (start < 0) {
    failures.push(`${MIG}: missing settlement_lines_line_type_chk_payrun ADD`);
    return failures;
  }
  const block = src.slice(start, start + 1200);
  for (const v of REQUIRED) {
    if (!new RegExp(`'${v}'`).test(block)) {
      failures.push(`${MIG}: §5 CHECK missing '${v}' (narrowing / not true supersets)`);
    }
  }
  return failures;
}

function selftest() {
  const tmp = fs.mkdtempSync("/tmp/verify-380000-line-type-");
  const rel = MIG;
  fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, rel),
    `ADD CONSTRAINT settlement_lines_line_type_chk_payrun CHECK (line_type IN ('earnings','escrow_contribution'));`
  );
  if (!run(tmp).length) throw new Error("selftest: narrow CHECK must FAIL");
  fs.writeFileSync(
    path.join(tmp, rel),
    `ADD CONSTRAINT settlement_lines_line_type_chk_payrun CHECK (line_type IN (${REQUIRED.map((v) => `'${v}'`).join(",")}));`
  );
  if (run(tmp).length) throw new Error("selftest: full CHECK must PASS");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-settlement-lines-line-type-superset --selftest OK");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else {
    const f = run();
    if (f.length) {
      console.error(f.join("\n"));
      process.exit(1);
    }
    console.log("verify-settlement-lines-line-type-superset — OK");
  }
}
