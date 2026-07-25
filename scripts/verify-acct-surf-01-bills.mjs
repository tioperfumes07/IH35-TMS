#!/usr/bin/env node
/**
 * ACCT-SURF-01 — Bills family deep structural DoD (beyond route-only).
 *
 * Frozen surface map: docs/trackers/ACCT-08-SURF-SURFACE-MAP-2026-07-25.md
 * Desktop Expected vs Actual: ~/Desktop/IH35-CURSOR-AUDIT/modules/accounting-surf-dod-2026-07-25.md
 *
 * Asserts:
 *  - DOD-A: /accounting/bills → BillsPage; Bills ▾ leaves in subnav; no ComingSoon twin
 *  - VERIFY-1: VendorBillCreatePage uses ParityDrawer
 *  - DOD-B / VERIFY-3: VendorBillForm submit carries vendor_id, bill_date, amount_cents, lines,
 *    and optional work_order_id / unit_id; createVendorBill POSTs /api/v1/accounting/bills
 *  - VERIFY-2 (structural): vendor + A/P account ReferenceSelect; A/P filters is_postable
 *  - VERIFY-3 server: createBill INSERTs accounting.bills (canonical — never RETIRE)
 *
 * Does NOT flip scoreboard PASS — live browser TRANSP+USMCA + reverse density remain UNVERIFIED/FAIL.
 *
 *   node scripts/verify-acct-surf-01-bills.mjs
 *   node scripts/verify-acct-surf-01-bills.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-surf-01-bills";

const FILES = {
  map: "docs/trackers/ACCT-08-SURF-SURFACE-MAP-2026-07-25.md",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  subnav: "apps/frontend/src/pages/accounting/subnav-manifest.ts",
  form: "apps/frontend/src/components/accounting/VendorBillForm.tsx",
  createPage: "apps/frontend/src/pages/accounting/VendorBillCreatePage.tsx",
  api: "apps/frontend/src/api/accounting.ts",
  service: "apps/backend/src/accounting/bills.service.ts",
};

const BILL_LEAVES = [
  "/accounting/bills",
  "/accounting/bills/maintenance",
  "/accounting/bills/repair",
  "/accounting/bills/fuel",
  "/accounting/bills/driver",
  "/accounting/bills/vendor",
  "/accounting/bills/multiple",
  "/accounting/bills/recurring",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function routeBlock(manifest, routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`path=["']${escaped}["'][\\s\\S]{0,500}?(?=path=["']|$)`);
  const m = manifest.match(re);
  return m ? m[0] : "";
}

function contractErrors(src) {
  const errors = [];
  if (!src.map.includes("ACCT-SURF-01") || !src.map.includes("/accounting/bills")) {
    errors.push("frozen map missing ACCT-SURF-01 → /accounting/bills");
  }

  const billsBlock = routeBlock(src.manifest, "/accounting/bills");
  if (!billsBlock) errors.push("DOD-A: missing route /accounting/bills");
  else {
    if (/ComingSoonPage/.test(billsBlock)) {
      errors.push("DOD-A: /accounting/bills must not mount ComingSoonPage");
    }
    if (!billsBlock.includes("<BillsPage")) {
      errors.push("DOD-A: /accounting/bills must render <BillsPage />");
    }
  }

  for (const leaf of BILL_LEAVES) {
    if (!src.subnav.includes(leaf)) {
      errors.push(`DOD-A / NEVER-DELETE: Bills leaf ${leaf} missing from subnav-manifest`);
    }
  }

  if (!src.createPage.includes("ParityDrawer") || !src.createPage.includes("<ParityDrawer")) {
    errors.push("VERIFY-1: VendorBillCreatePage must use ParityDrawer");
  }
  if (!src.createPage.includes("VendorBillForm")) {
    errors.push("VERIFY-1: VendorBillCreatePage must mount VendorBillForm");
  }
  if (!src.createPage.includes("createVendorBill")) {
    errors.push("VERIFY-3: VendorBillCreatePage must call createVendorBill");
  }

  for (const needle of [
    "vendor_id:",
    "bill_date:",
    "amount_cents:",
    "lines:",
    "work_order_id:",
    "unit_id:",
  ]) {
    if (!src.form.includes(needle)) {
      errors.push(`DOD-B: VendorBillForm submit payload missing ${needle}`);
    }
  }

  if (!src.form.includes('createKind="vendor"')) {
    errors.push("VERIFY-2: VendorBillForm vendor picker must use ReferenceSelect createKind=vendor");
  }
  if (!src.form.includes('createKind="account"') && !src.form.includes("createKind={'account'}")) {
    errors.push("VERIFY-2: VendorBillForm A/P must use ReferenceSelect createKind=account");
  }
  if (!src.form.includes("listCatalogAccounts")) {
    errors.push("VERIFY-2: A/P accounts must load via listCatalogAccounts (is_postable shape)");
  }
  if (!src.form.includes("is_postable")) {
    errors.push("VERIFY-2: A/P picker must filter catalogs.accounts.is_postable");
  }

  if (!src.api.includes("function createVendorBill") || !src.api.includes("/api/v1/accounting/bills")) {
    errors.push("VERIFY-3: createVendorBill must POST /api/v1/accounting/bills");
  } else {
    // Ensure the bills path is inside the createVendorBill function body (not only elsewhere).
    const fnIdx = src.api.indexOf("function createVendorBill");
    const slice = src.api.slice(fnIdx, fnIdx + 2500);
    if (!slice.includes("/api/v1/accounting/bills") || !slice.includes('method: "POST"')) {
      errors.push("VERIFY-3: createVendorBill body must POST /api/v1/accounting/bills");
    }
  }

  if (!src.service.includes("INSERT INTO accounting.bills")) {
    errors.push("VERIFY-3: createBill must INSERT INTO accounting.bills (canonical)");
  }
  if (!src.service.includes("linked_work_order_uuid") || !src.service.includes("unit_id")) {
    errors.push("VERIFY-4: createBill must persist linked_work_order_uuid + unit_id");
  }
  if (/INSERT INTO\s+bank\.bills|INSERT INTO\s+payroll\.bills/i.test(src.service)) {
    errors.push("VERIFY-3: createBill must not write RETIRE schemas");
  }

  return errors;
}

function selftest() {
  const good = {
    map: "ACCT-SURF-01 `/accounting/bills`",
    manifest: 'path="/accounting/bills"\n<BillsPage />\n',
    subnav: BILL_LEAVES.join("\n"),
    form: [
      "vendor_id:",
      "bill_date:",
      "amount_cents:",
      "lines:",
      "work_order_id:",
      "unit_id:",
      'createKind="vendor"',
      'createKind="account"',
      "listCatalogAccounts",
      "is_postable",
    ].join("\n"),
    createPage: 'import { ParityDrawer }\n<ParityDrawer>\n<VendorBillForm />\ncreateVendorBill\n',
    api: 'export function createVendorBill(){ return apiRequest(`/api/v1/accounting/bills`, { method: "POST" }) }',
    service: "INSERT INTO accounting.bills (linked_work_order_uuid, unit_id)",
  };
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(good));
    process.exit(1);
  }
  const bad = { ...good, createPage: "export function VendorBillCreatePage(){ return <div>thin</div> }" };
  if (!contractErrors(bad).some((e) => e.includes("ParityDrawer"))) {
    console.error(`${LABEL} --selftest FAIL thin create page not caught`);
    process.exit(1);
  }
  const twin = {
    ...good,
    manifest: 'path="/accounting/bills"\n<ComingSoonPage />\n',
  };
  if (!contractErrors(twin).some((e) => e.includes("ComingSoon"))) {
    console.error(`${LABEL} --selftest FAIL ComingSoon twin not caught`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const errors = contractErrors(src);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — ACCT-SURF-01 Bills family structural DoD (route+ParityDrawer+payload+canonical accounting.bills); live browser still UNVERIFIED`
);
process.exit(0);
