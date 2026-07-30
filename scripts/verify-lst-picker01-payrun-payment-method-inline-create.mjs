#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — Settlement PayRunClosePanel payment method must use
 * PaymentMethodPicker (first-row "+ Add new payment method" → catalogs.payment_methods),
 * not a bare SelectCombobox with Lists-only create.
 * Cursor even claim: 1830.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-payrun-payment-method-inline-create";
const PANEL = "apps/frontend/src/pages/driver-finance/components/PayRunClosePanel.tsx";
const PICKER = "apps/frontend/src/components/driver-finance/PaymentMethodPicker.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];
  const panel = readRel(root, PANEL);
  const picker = readRel(root, PICKER);

  if (!panel) problems.push(`missing ${PANEL}`);
  else {
    const code = panel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (!/PaymentMethodPicker/.test(code)) {
      problems.push(`${PANEL}: must use PaymentMethodPicker for payment method`);
    }
    if (!/payrun-payment-method-picker/.test(panel)) {
      problems.push(`${PANEL}: must expose data-testid=payrun-payment-method-picker`);
    }
    if (/SelectCombobox/.test(code)) {
      problems.push(`${PANEL}: must not keep SelectCombobox for payment method`);
    }
    if (/listPaymentMethods/.test(code)) {
      problems.push(`${PANEL}: must not list payment methods itself — picker owns the query`);
    }
  }

  if (!picker) problems.push(`missing ${PICKER}`);
  else {
    if (!/allowAddNew/.test(picker)) {
      problems.push(`${PICKER}: must keep allowAddNew first-row create`);
    }
    if (!/createPaymentMethod/.test(picker)) {
      problems.push(`${PICKER}: must POST via createPaymentMethod`);
    }
    if (!/\+ Add new payment method/.test(picker)) {
      problems.push(`${PICKER}: vocab must be "+ Add new payment method"`);
    }
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — PayRunClosePanel payment method inline create`);
}
