#!/usr/bin/env node
/**
 * verify-bill-subnav-creators.mjs
 *
 * GUARD 0441-mod7: Maintenance/Repair/Fuel/Driver bill subnav must open the existing
 * ParityDrawer bill creator (not filter-only ?category= redirects).
 *
 * Usage:
 *   node scripts/verify-bill-subnav-creators.mjs
 *   node scripts/verify-bill-subnav-creators.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bill-subnav-creators";
const BILLS_PAGE = "apps/frontend/src/pages/accounting/BillsPage.tsx";
const CREATE_MODAL = "apps/frontend/src/pages/maintenance/components/CreateBillModal.tsx";
const VENDOR_FORM = "apps/frontend/src/components/accounting/VendorBillForm.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

const TYPED_SUBNAV = [
  { slug: "maintenance", category: "maintenance" },
  { slug: "repair", category: "repair" },
  { slug: "fuel", category: "fuel" },
  { slug: "driver", category: "driver" },
];

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check({ billsPage, createModal, vendorForm, manifest }) {
  const f = [];

  if (!billsPage) {
    f.push(`${BILLS_PAGE}: missing`);
  } else {
    if (!/CreateBillModal/.test(billsPage)) {
      f.push(`${BILLS_PAGE}: must wire CreateBillModal (QBO side-panel creator)`);
    }
    if (!/searchParams\.get\(\s*["']create["']\s*\)\s*===\s*["']1["']/.test(billsPage)) {
      f.push(`${BILLS_PAGE}: must honor ?create=1 to open the bill creator`);
    }
    if (!/initialBillType/.test(billsPage)) {
      f.push(`${BILLS_PAGE}: must pass initialBillType from category filter into creator`);
    }
    if (!/data-testid\s*=\s*["']bills-create-cta["']/.test(billsPage)) {
      f.push(`${BILLS_PAGE}: must expose a + Create CTA (data-testid=bills-create-cta)`);
    }
  }

  if (!createModal) {
    f.push(`${CREATE_MODAL}: missing`);
  } else if (!/initialBillType/.test(createModal)) {
    f.push(`${CREATE_MODAL}: must accept initialBillType for subnav preselect`);
  }

  if (!vendorForm) {
    f.push(`${VENDOR_FORM}: missing`);
  } else if (!/initialBillType/.test(vendorForm)) {
    f.push(`${VENDOR_FORM}: must accept initialBillType prop`);
  }

  if (!manifest) {
    f.push(`${MANIFEST}: missing`);
  } else {
    for (const { slug, category } of TYPED_SUBNAV) {
      const pattern = new RegExp(
        `path\\s*=\\s*["']/accounting/bills/${slug}["'][\\s\\S]*?Navigate to="/accounting/bills\\?category=${category}&create=1"`,
      );
      if (!pattern.test(manifest)) {
        f.push(
          `${MANIFEST}: /accounting/bills/${slug} must redirect to filtered list AND creator (?category=${category}&create=1)`,
        );
      }
    }
  }

  return f;
}

export function run() {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  return check({
    billsPage: read(BILLS_PAGE),
    createModal: read(CREATE_MODAL),
    vendorForm: read(VENDOR_FORM),
    manifest: read(MANIFEST),
  });
}

if (process.argv.includes("--selftest")) {
  const goodBills = `
    import { CreateBillModal } from "../maintenance/components/CreateBillModal";
    const createOpen = searchParams.get("create") === "1";
    <button data-testid="bills-create-cta" />
    <CreateBillModal open={createOpen} initialBillType={createBillType} />
  `;
  const goodModal = `initialBillType?: string; initialBillType={initialBillType}`;
  const goodForm = `initialBillType?: string; initialBillType`;
  const goodManifest = TYPED_SUBNAV.map(
    ({ slug, category }) =>
      `path="/accounting/bills/${slug}" element={<Navigate to="/accounting/bills?category=${category}&create=1" replace />}`,
  ).join("\n");

  const checks = [
    ["healthy wiring passes", check({ billsPage: goodBills, createModal: goodModal, vendorForm: goodForm, manifest: goodManifest }).length === 0],
    [
      "missing CreateBillModal caught",
      check({ billsPage: goodBills.replaceAll("CreateBillModal", "MissingModal"), createModal: goodModal, vendorForm: goodForm, manifest: goodManifest }).some((x) =>
        x.includes("CreateBillModal"),
      ),
    ],
    [
      "filter-only redirect caught",
      check({
        billsPage: goodBills,
        createModal: goodModal,
        vendorForm: goodForm,
        manifest: goodManifest.replace("&create=1", ""),
      }).some((x) => x.includes("create=1")),
    ],
  ];

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const f = run();
  if (f.length) {
    console.error(`${LABEL} FAIL:`);
    for (const x of f) console.error("  ✗ " + x);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — typed bill subnav opens ParityDrawer creator + category filter`);
  process.exit(0);
}
