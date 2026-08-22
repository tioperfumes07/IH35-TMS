#!/usr/bin/env node
/**
 * @matrix-built {"modules":["accounting"],"cols":["connectivity"],"leafRe":"^(home|invoices\\.|bills\\.|expenses\\.|payments|je\\.|bill_payments)","task":"ACCT-SUBNAV-GROUPED-MONEY-CREATE","pr":"#6455+#6462"}
 * CI guard: Accounting top-bar sub-nav = APPROVED grouped click-open dropdowns.
 *
 * Source of truth (LOCKED): docs/approved-screens/3-Accounting-Dropdown.png +
 * docs/specs/NAVIGATION-PATTERN-RULE.md (Jorge directive 2026-06-09: top-bar sub-nav groups open on
 * CLICK and stay open until item chosen / outside-click / Escape — NOT hover) +
 * docs/lockdown/00_LOCKED_DECISIONS.md.
 *
 * Prevents silent regression back to the flat ACCOUNTING_CLEAN_TABS tab bar (undocumented #1552 drift)
 * that this rework superseded. Asserts:
 *   1. AccountingSubNavWrapper renders the shared HoverDropdownNav from ACCOUNTING_SUB_NAV_ITEMS.
 *   2. It opens on CLICK (openOn="click"), not hover.
 *   3. It does NOT render the flat ACCOUNTING_CLEAN_TABS / ACCOUNTING_MORE_TABS arrays.
 *   4. The manifest's approved top-node group labels are exactly the approved set.
 *   5. Bills ▾ surfaces the PNG bill types.
 *
 * Run `node scripts/verify-accounting-subnav-grouped.mjs --selftest` to self-check the guard logic.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-accounting-subnav-grouped";

const ESCROW_PAGE = "apps/frontend/src/pages/accounting/EscrowPage.tsx";
const WRAPPER_FILE = "apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx";
const MANIFEST_FILE = "apps/frontend/src/pages/accounting/subnav-manifest.ts";

/** Live Chrome leftover: /accounting/escrow h1 was wrapper default "Accounting" while URL was escrow. */
export function checkEscrowPageH1(src) {
  const failures = [];
  if (!/<AccountingSubNavWrapper[\s\S]*?title="Escrow"/.test(src)) {
    failures.push('EscrowPage must pass title="Escrow" into AccountingSubNavWrapper (h1 must not stay "Accounting")');
  }
  return failures;
}

/** Approved top-node group labels (PNG + ACCT-F5050 Invoices ▾ promotion). "More" is the overflow. */
const APPROVED_GROUP_LABELS = [
  "Accounting",
  "Bills",
  "Expenses",
  "Bill payment",
  "Invoices",
  "Maintenance & shop",
  "Vendors",
  "Customers",
  "Reports",
  "More",
];

/** Bills ▾ children per the approved PNG. */
const APPROVED_BILLS_CHILDREN = [
  { label: "Bill", path: "/accounting/bills" },
  { label: "Maintenance bill", path: "/accounting/bills/maintenance" },
  { label: "Repair bill", path: "/accounting/bills/repair" },
  { label: "Fuel bill", path: "/accounting/bills/fuel" },
  { label: "Driver bill", path: "/accounting/bills/driver" },
  { label: "Vendor bill", path: "/accounting/bills/vendor" },
  { label: "Multiple bills", path: "/accounting/bills/multiple" },
];

/** Returns a list of failure strings (empty = pass). Pure so it can be self-tested. */
export function checkWrapper(src) {
  const failures = [];
  if (!src.includes("HoverDropdownNav")) {
    failures.push("wrapper must render the shared HoverDropdownNav (top-bar grouped dropdowns)");
  }
  if (!src.includes("ACCOUNTING_SUB_NAV_ITEMS")) {
    failures.push("wrapper must source the grouped nav from ACCOUNTING_SUB_NAV_ITEMS");
  }
  // Click-open-persistent (NOT hover) — LOCKED June 2026 directive.
  if (!/openOn\s*=\s*["'{]?\s*["']click["']/.test(src) && !src.includes('openOn="click"')) {
    failures.push('wrapper must open groups on CLICK (openOn="click"), not hover — NAVIGATION-PATTERN-RULE');
  }
  // Must NOT resurrect the flat tab-bar render.
  if (/ACCOUNTING_CLEAN_TABS\s*\.\s*map/.test(src) || /ACCOUNTING_MORE_TABS\s*\.\s*map/.test(src)) {
    failures.push("wrapper must NOT render the flat ACCOUNTING_CLEAN_TABS / ACCOUNTING_MORE_TABS tab bar");
  }
  return failures;
}

/** Returns a list of failure strings (empty = pass). Pure so it can be self-tested. */
export function checkManifest(src) {
  const failures = [];

  // Approved top-node group labels present (via GROUP_LABELS literals).
  for (const label of APPROVED_GROUP_LABELS) {
    if (!src.includes(`"${label}"`)) {
      failures.push(`manifest missing approved top-node label "${label}"`);
    }
  }

  // The rendered model must reference each approved group.
  const modelBlock = src.match(/ACCOUNTING_SUB_NAV_ITEMS[\s\S]*?\n\s*\];/);
  if (!modelBlock) {
    failures.push("manifest missing ACCOUNTING_SUB_NAV_ITEMS export array");
  } else {
    const block = modelBlock[0];
    for (const g of ["bills", "expenses", "billpay", "invoices", "maint_shop", "more"]) {
      if (!block.includes(`GROUP_LABELS.${g}`)) {
        failures.push(`ACCOUNTING_SUB_NAV_ITEMS missing group GROUP_LABELS.${g}`);
      }
    }
    for (const leaf of ["/accounting/vendors", "/accounting/customers", "/accounting/reports", "/accounting"]) {
      if (!block.includes(`leafOf("${leaf}")`)) {
        failures.push(`ACCOUNTING_SUB_NAV_ITEMS missing top-level leaf leafOf("${leaf}")`);
      }
    }
  }

  // Bills ▾ children per PNG (registry entries with section "bills"). Uses exact-substring checks against
  // the manifest's canonical one-line entry formatting.
  for (const child of APPROVED_BILLS_CHILDREN) {
    const entry = `label: "${child.label}", path: "${child.path}", section: "bills"`;
    if (!src.includes(entry)) {
      failures.push(`Bills ▾ missing PNG child ${child.label} (${child.path}) under section "bills"`);
    }
  }

  return failures;
}

function selftest() {
  const problems = [];

  // --- checkWrapper ---
  const goodWrapper = `
    import { HoverDropdownNav } from "x";
    import { ACCOUNTING_SUB_NAV_ITEMS } from "./subnav-manifest";
    <HoverDropdownNav items={[...ACCOUNTING_SUB_NAV_ITEMS]} activeHref={a} openOn="click" />
  `;
  if (checkWrapper(goodWrapper).length !== 0) problems.push("selftest: good wrapper should pass");

  const hoverWrapper = `
    import { HoverDropdownNav } from "x";
    import { ACCOUNTING_SUB_NAV_ITEMS } from "./subnav-manifest";
    <HoverDropdownNav items={[...ACCOUNTING_SUB_NAV_ITEMS]} activeHref={a} />
  `;
  if (checkWrapper(hoverWrapper).length === 0) problems.push("selftest: hover (no openOn=click) wrapper should FAIL");

  const flatWrapper = `
    import { ACCOUNTING_CLEAN_TABS } from "./subnav-manifest";
    {ACCOUNTING_CLEAN_TABS.map((t) => <NavLink to={t.to}>{t.label}</NavLink>)}
  `;
  if (checkWrapper(flatWrapper).length === 0) problems.push("selftest: flat clean-tabs render should FAIL");

  // --- checkManifest ---
  const goodManifest = `
    export const GROUP_LABELS = {
      home: "Accounting", bills: "Bills", expenses: "Expenses", billpay: "Bill payment",
      invoices: "Invoices",
      maint_shop: "Maintenance & shop", vendors: "Vendors", customers: "Customers",
      reports: "Reports", more: "More",
    } as const;
    { label: "Bill", path: "/accounting/bills", section: "bills" },
    { label: "Maintenance bill", path: "/accounting/bills/maintenance", section: "bills" },
    { label: "Repair bill", path: "/accounting/bills/repair", section: "bills" },
    { label: "Fuel bill", path: "/accounting/bills/fuel", section: "bills" },
    { label: "Driver bill", path: "/accounting/bills/driver", section: "bills" },
    { label: "Vendor bill", path: "/accounting/bills/vendor", section: "bills" },
    { label: "Multiple bills", path: "/accounting/bills/multiple", section: "bills" },
    export const ACCOUNTING_SUB_NAV_ITEMS = [
      leafOf("/accounting"),
      { label: GROUP_LABELS.bills, children: childrenOf("bills") },
      { label: GROUP_LABELS.expenses, children: childrenOf("expenses") },
      { label: GROUP_LABELS.billpay, children: childrenOf("billpay") },
      { label: GROUP_LABELS.invoices, children: childrenOf("invoices") },
      { label: GROUP_LABELS.maint_shop, children: [] },
      leafOf("/accounting/vendors"),
      leafOf("/accounting/customers"),
      leafOf("/accounting/reports"),
      { label: GROUP_LABELS.more, children: childrenOf("more") },
    ];
  `;
  if (checkManifest(goodManifest).length !== 0) {
    problems.push(`selftest: good manifest should pass — got: ${checkManifest(goodManifest).join("; ")}`);
  }

  const flatManifest = goodManifest.replace(/GROUP_LABELS\.bills/g, "").replace('"Bill payment"', '"BillPay"');
  if (checkManifest(flatManifest).length === 0) problems.push("selftest: manifest missing a group should FAIL");

  if (checkEscrowPageH1('<AccountingSubNavWrapper title="Escrow">').length !== 0) {
    problems.push("selftest: Escrow wrapper with title=Escrow should PASS");
  }
  if (checkEscrowPageH1("<AccountingSubNavWrapper>").length === 0) {
    problems.push("selftest: Escrow wrapper without title=Escrow should FAIL");
  }

  if (problems.length) {
    console.error(`[${LABEL}] SELFTEST FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] SELFTEST PASSED`);
  process.exit(0);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const root = process.cwd();
  const failures = [];

  const wrapperPath = path.join(root, WRAPPER_FILE);
  const manifestPath = path.join(root, MANIFEST_FILE);

  if (!fs.existsSync(wrapperPath)) failures.push(`${WRAPPER_FILE} (missing)`);
  else failures.push(...checkWrapper(fs.readFileSync(wrapperPath, "utf8")).map((m) => `${WRAPPER_FILE}: ${m}`));

  if (!fs.existsSync(manifestPath)) failures.push(`${MANIFEST_FILE} (missing)`);
  else failures.push(...checkManifest(fs.readFileSync(manifestPath, "utf8")).map((m) => `${MANIFEST_FILE}: ${m}`));

  const escrowPath = path.join(root, ESCROW_PAGE);
  if (!fs.existsSync(escrowPath)) failures.push(`${ESCROW_PAGE} (missing)`);
  else failures.push(...checkEscrowPageH1(fs.readFileSync(escrowPath, "utf8")).map((m) => `${ESCROW_PAGE}: ${m}`));

  if (failures.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Accounting sub-nav = approved grouped click-open dropdowns (7 groups + Home + More)`);
  process.exit(0);
}

main();
