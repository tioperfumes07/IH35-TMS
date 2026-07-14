#!/usr/bin/env node
/**
 * CI guard: Accounting sub-nav — QBO-parity mirror-scope items in exact QBO order.
 *
 * Block: C7-ACCT-SUBNAV-CHROME ("Accounting sub-nav 12 QBO items (exact live order) + global
 * toolbar"). Canonical order source: docs/specs/qbo-parity/QBO_PARITY_UI_SYSTEM.md B5 ("Accounting
 * sub-nav (mirror scope, additive)"), which lists 11 named items — the same 11 the original C7
 * commit (PR #865 / 282b9b41c) shipped as `QBO_ACCOUNTING_SUBNAV`. That array was retired (PR #1658)
 * along with the left-rail component that rendered it (forbidden by CLAUDE.md §7 — nav must live on
 * the top bar), but the items were never re-wired into the surviving `AccountingSubNavWrapper`
 * chrome, leaving them reachable only by typing the URL. This guard asserts:
 *
 *   1. `ACCOUNTING_QBO_MIRROR_TABS` exists in subnav-manifest.ts with the 11 QBO items, in the
 *      EXACT canonical order (label + route pairs).
 *   2. `AccountingSubNavWrapper.tsx` actually renders that array (a "QBO ▾" menu), so the items are
 *      reachable by clicking, not just defined.
 *   3. ADDITIVE-ONLY (§7): `ACCOUNTING_CLEAN_TABS` and `ACCOUNTING_MORE_TABS` still contain every
 *      pre-existing item — none deleted or reordered — so this change can never regress those.
 *
 * Run: node scripts/verify-accounting-subnav-order.mjs
 * Self-test (no repo files touched): node scripts/verify-accounting-subnav-order.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const REPO_ROOT = process.cwd();
const MANIFEST_REL = "apps/frontend/src/pages/accounting/subnav-manifest.ts";
const WRAPPER_REL = "apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx";

// Canonical QBO order (docs/specs/qbo-parity/QBO_PARITY_UI_SYSTEM.md B5). Label + route pairs,
// exact order. Do not reorder this array without updating the spec doc first.
export const CANONICAL_QBO_MIRROR_ORDER = [
  ["Bank transactions", "/banking"],
  ["Integration transactions", "/accounting/integration-transactions"],
  ["Receipts", "/accounting/receipts"],
  ["Reconcile", "/banking/reconcile"],
  ["Rules", "/banking/categorization-rules"],
  ["Chart of accounts", "/lists/accounting/chart-of-accounts"],
  ["Recurring transactions", "/accounting/recurring-transactions"],
  ["Revenue recognition", "/accounting/revenue-recognition"],
  ["Fixed assets", "/accounting/fixed-assets"],
  ["Prepaid expenses", "/accounting/prepaid-expenses"],
  ["My accountant", "/accounting/my-accountant"],
];

// Pre-existing top tab bar + More-menu labels that must never be deleted or reordered by this
// (or any future) additive change. Snapshot taken from main at the time this guard was written.
export const REQUIRED_CLEAN_TAB_LABELS_IN_ORDER = [
  "Home",
  "Bills",
  "Expenses",
  "Expenses List",
  "Bill Payment",
  "Invoices",
  "Receive Payment",
  "Settlements",
  "Factoring",
  "Journal Entries",
  "Account Register",
  "A/P Aging",
  "All Transactions",
  "Daily Recon",
  "Reports",
];

export const REQUIRED_MORE_TAB_LABELS_IN_ORDER = [
  "Chart of Accounts",
  "Month Close",
  "Multi-entity",
  "Audit Trail",
  "Posting Lineage",
  "QBO Sync Drift",
  "Account Type Catalog",
  "Payment Methods Catalog",
  "Settings",
];

/** Extracts the ordered [label, to] pairs of a `export const NAME = [ ... ] as const;` array. */
export function extractLabelToPairs(source, arrayName) {
  const re = new RegExp(`export const ${arrayName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const;`);
  const match = re.exec(source);
  if (!match) return null;
  const body = match[1];
  const pairs = [];
  const entryRe = /label:\s*"([^"]*)"\s*,\s*to:\s*"([^"]*)"/g;
  let m;
  while ((m = entryRe.exec(body))) pairs.push([m[1], m[2]]);
  return pairs;
}

export function extractOrderedLabels(source, arrayName) {
  const pairs = extractLabelToPairs(source, arrayName);
  return pairs ? pairs.map(([label]) => label) : null;
}

export function runChecks({ manifestSource, wrapperSource }) {
  const failures = [];

  // ── Check 1: ACCOUNTING_QBO_MIRROR_TABS exists with exact canonical order ──
  const qboPairs = extractLabelToPairs(manifestSource, "ACCOUNTING_QBO_MIRROR_TABS");
  if (!qboPairs) {
    failures.push("ACCOUNTING_QBO_MIRROR_TABS not found in subnav-manifest.ts");
  } else {
    if (qboPairs.length !== CANONICAL_QBO_MIRROR_ORDER.length) {
      failures.push(
        `ACCOUNTING_QBO_MIRROR_TABS has ${qboPairs.length} items, expected ${CANONICAL_QBO_MIRROR_ORDER.length} (canonical QBO mirror-scope list)`,
      );
    }
    const len = Math.min(qboPairs.length, CANONICAL_QBO_MIRROR_ORDER.length);
    for (let i = 0; i < len; i++) {
      const [gotLabel, gotTo] = qboPairs[i];
      const [wantLabel, wantTo] = CANONICAL_QBO_MIRROR_ORDER[i];
      if (gotLabel !== wantLabel || gotTo !== wantTo) {
        failures.push(
          `ACCOUNTING_QBO_MIRROR_TABS[${i}] = {label:"${gotLabel}", to:"${gotTo}"}, expected {label:"${wantLabel}", to:"${wantTo}"} (QBO order mismatch)`,
        );
      }
    }
  }

  // ── Check 2: AccountingSubNavWrapper actually renders ACCOUNTING_QBO_MIRROR_TABS ──
  if (!/ACCOUNTING_QBO_MIRROR_TABS/.test(wrapperSource)) {
    failures.push("AccountingSubNavWrapper.tsx does not import/render ACCOUNTING_QBO_MIRROR_TABS — items defined but unreachable");
  } else if (!/ACCOUNTING_QBO_MIRROR_TABS\.map/.test(wrapperSource)) {
    failures.push("AccountingSubNavWrapper.tsx imports ACCOUNTING_QBO_MIRROR_TABS but never maps/renders it");
  }

  // ── Check 3: additive-only — CLEAN_TABS and MORE_TABS untouched ──
  const cleanLabels = extractOrderedLabels(manifestSource, "ACCOUNTING_CLEAN_TABS");
  if (!cleanLabels) {
    failures.push("ACCOUNTING_CLEAN_TABS not found in subnav-manifest.ts");
  } else {
    for (let i = 0; i < REQUIRED_CLEAN_TAB_LABELS_IN_ORDER.length; i++) {
      if (cleanLabels[i] !== REQUIRED_CLEAN_TAB_LABELS_IN_ORDER[i]) {
        failures.push(
          `ACCOUNTING_CLEAN_TABS[${i}] = "${cleanLabels[i] ?? "(missing)"}", expected "${REQUIRED_CLEAN_TAB_LABELS_IN_ORDER[i]}" (additive-only violation — §7 forbids deleting/reordering existing tabs)`,
        );
      }
    }
  }

  const moreLabels = extractOrderedLabels(manifestSource, "ACCOUNTING_MORE_TABS");
  if (!moreLabels) {
    failures.push("ACCOUNTING_MORE_TABS not found in subnav-manifest.ts");
  } else {
    for (let i = 0; i < REQUIRED_MORE_TAB_LABELS_IN_ORDER.length; i++) {
      if (moreLabels[i] !== REQUIRED_MORE_TAB_LABELS_IN_ORDER[i]) {
        failures.push(
          `ACCOUNTING_MORE_TABS[${i}] = "${moreLabels[i] ?? "(missing)"}", expected "${REQUIRED_MORE_TAB_LABELS_IN_ORDER[i]}" (additive-only violation — §7 forbids deleting/reordering existing tabs)`,
        );
      }
    }
  }

  return failures;
}

function selftest() {
  let ok = true;
  const assert = (cond, msg) => {
    if (!cond) {
      console.error(`SELFTEST FAIL: ${msg}`);
      ok = false;
    } else {
      console.log(`SELFTEST PASS: ${msg}`);
    }
  };

  // Fixture 1: everything correct — expect zero failures.
  const goodManifest = `
export const ACCOUNTING_CLEAN_TABS = [
${REQUIRED_CLEAN_TAB_LABELS_IN_ORDER.map((l) => `  { label: "${l}", to: "/x" },`).join("\n")}
] as const;

export const ACCOUNTING_MORE_TABS = [
${REQUIRED_MORE_TAB_LABELS_IN_ORDER.map((l) => `  { label: "${l}", to: "/y" },`).join("\n")}
] as const;

export const ACCOUNTING_QBO_MIRROR_TABS = [
${CANONICAL_QBO_MIRROR_ORDER.map(([l, t]) => `  { label: "${l}",        to: "${t}" },`).join("\n")}
] as const;
`;
  const goodWrapper = `
import { ACCOUNTING_QBO_MIRROR_TABS } from "./subnav-manifest";
{ACCOUNTING_QBO_MIRROR_TABS.map((item) => <NavLink key={item.label} to={item.to}>{item.label}</NavLink>)}
`;
  assert(runChecks({ manifestSource: goodManifest, wrapperSource: goodWrapper }).length === 0, "correct fixture produces zero failures");

  // Fixture 2: wrong order in QBO mirror tabs — expect a failure.
  const swappedOrder = [...CANONICAL_QBO_MIRROR_ORDER];
  [swappedOrder[0], swappedOrder[1]] = [swappedOrder[1], swappedOrder[0]];
  const badManifest = goodManifest.replace(
    /export const ACCOUNTING_QBO_MIRROR_TABS = \[[\s\S]*?\] as const;/,
    `export const ACCOUNTING_QBO_MIRROR_TABS = [\n${swappedOrder.map(([l, t]) => `  { label: "${l}", to: "${t}" },`).join("\n")}\n] as const;`,
  );
  const swappedFailures = runChecks({ manifestSource: badManifest, wrapperSource: goodWrapper });
  assert(swappedFailures.some((f) => f.includes("QBO order mismatch")), "swapped QBO order is detected");

  // Fixture 3: wrapper doesn't render the array — expect a failure.
  const unwiredFailures = runChecks({ manifestSource: goodManifest, wrapperSource: "// no reference here" });
  assert(unwiredFailures.some((f) => f.includes("unreachable")), "unrendered QBO array is detected");

  // Fixture 4: an existing CLEAN_TABS label deleted — expect an additive-only failure.
  const deletedManifest = goodManifest.replace('{ label: "Factoring", to: "/x" },\n', "");
  const deletedFailures = runChecks({ manifestSource: deletedManifest, wrapperSource: goodWrapper });
  assert(deletedFailures.some((f) => f.includes("additive-only violation")), "deleted existing CLEAN_TABS entry is detected");

  if (!ok) process.exit(1);
  console.log("\nAll selftest fixtures passed.");
  process.exit(0);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const manifestPath = path.join(REPO_ROOT, MANIFEST_REL);
  const wrapperPath = path.join(REPO_ROOT, WRAPPER_REL);

  if (!fs.existsSync(manifestPath)) {
    console.error(`[verify-accounting-subnav-order] FAIL: ${MANIFEST_REL} not found`);
    process.exit(1);
  }
  if (!fs.existsSync(wrapperPath)) {
    console.error(`[verify-accounting-subnav-order] FAIL: ${WRAPPER_REL} not found`);
    process.exit(1);
  }

  const manifestSource = fs.readFileSync(manifestPath, "utf8");
  const wrapperSource = fs.readFileSync(wrapperPath, "utf8");

  const failures = runChecks({ manifestSource, wrapperSource });

  if (failures.length > 0) {
    console.error("[verify-accounting-subnav-order] FAIL:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(
    `[verify-accounting-subnav-order] OK — ${CANONICAL_QBO_MIRROR_ORDER.length} QBO mirror-scope items in exact canonical order, reachable from AccountingSubNavWrapper; CLEAN_TABS/MORE_TABS additive-intact`,
  );
}

main();
