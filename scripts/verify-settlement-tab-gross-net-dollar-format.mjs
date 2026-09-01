#!/usr/bin/env node
/**
 * ACCT-F10157 — LoadDetailSettlementTab pay summary must format decimal DOLLARS from
 * driver_finance.driver_settlements (gross_pay, deductions_total, reimbursements_total, net_pay).
 * formatMoneyCents divides by 100 → 100x-low display ($1.20 for $120.00).
 *
 * FAIL: any of the four summary fields uses formatMoneyCents, or formatMoneyDollars divides by 100.
 * PASS: all four use formatMoneyDollars; dollars formatter does not divide.
 *
 * Self-test: node scripts/verify-settlement-tab-gross-net-dollar-format.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-tab-gross-net-dollar-format";
const TAB = path.join(ROOT, "apps/frontend/src/components/dispatch/LoadDetailSettlementTab.tsx");
const CONSTANTS = path.join(ROOT, "apps/frontend/src/components/dispatch/constants.ts");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check(tabSrc, constantsSrc) {
  assert(/import \{ formatMoneyDollars \} from "\.\/constants"/.test(tabSrc), "must import formatMoneyDollars");
  assert(!/formatMoneyCents\(settlement\.(gross_pay|deductions_total|reimbursements_total|net_pay)/.test(tabSrc), "must not pass settlement dollar fields through formatMoneyCents");
  assert(
    /formatMoneyDollars\(settlement\.gross_pay,[\s\S]*formatMoneyDollars\(settlement\.deductions_total,[\s\S]*formatMoneyDollars\(settlement\.reimbursements_total,[\s\S]*formatMoneyDollars\(settlement\.net_pay,/.test(
      tabSrc
    ),
    "all four settlement summary pay fields must use formatMoneyDollars"
  );
  assert(/function formatMoneyDollars\([\s\S]{0,420}\.format\(Number\(valueDollars\)\)/.test(constantsSrc), "formatMoneyDollars must not divide decimal dollars by 100");
}

function selftest() {
  const tabOriginal = fs.readFileSync(TAB, "utf8");
  const constantsOriginal = fs.readFileSync(CONSTANTS, "utf8");

  const plants = [
    {
      label: "cents formatter on gross_pay",
      tab: tabOriginal.replace("formatMoneyDollars(settlement.gross_pay", "formatMoneyCents(settlement.gross_pay"),
      constants: constantsOriginal,
    },
    {
      label: "dollars formatter divides by 100",
      tab: tabOriginal,
      constants: constantsOriginal.replace(
        ".format(Number(valueDollars))",
        ".format(Number(valueDollars) / 100)"
      ),
    },
  ];

  for (const plant of plants) {
    let failed = false;
    try {
      check(plant.tab, plant.constants);
    } catch {
      failed = true;
    }
    assert(failed, `--selftest expected FAIL when ${plant.label}`);
  }

  check(tabOriginal, constantsOriginal);
  console.log(`${LABEL}: OK — selftest PASS (${plants.length} planted defects rejected)`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "check";
try {
  const tabSrc = fs.readFileSync(TAB, "utf8");
  const constantsSrc = fs.readFileSync(CONSTANTS, "utf8");
  if (mode === "selftest") selftest();
  else {
    check(tabSrc, constantsSrc);
    console.log(`${LABEL}: OK`);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
