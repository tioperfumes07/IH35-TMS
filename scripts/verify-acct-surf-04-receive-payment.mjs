#!/usr/bin/env node
/**
 * @matrix-built {"modules":["accounting"],"cols":["connectivity","picker_law"],"leafRe":"^(payments\\.receive|payments)$","task":"ACCT-F5055-RECEIVE-PAYMENT-CREATE-URL","pr":"#6459"}
 * ACCT-SURF-04 — Receive Payment deep structural DoD.
 *
 * Frozen map: docs/trackers/ACCT-08-SURF-SURFACE-MAP-2026-07-25.md
 * Desktop: ~/Desktop/IH35-CURSOR-AUDIT/modules/accounting-surf-dod-2026-07-25.md
 *
 * Asserts:
 *  - DOD-A: /accounting/payments -> PaymentsListPage; leaf present in subnav; no ComingSoon twin
 *  - VERIFY-1: RecordPaymentModal uses ParityDrawer; PaymentsListPage mounts RecordPaymentModal
 *  - VERIFY-2: RecordPaymentModal customer/deposit pickers use ReferenceSelect createKind
 *  - DOD-B / VERIFY-3: submit payload carries customer_id, payment_date, amount_cents,
 *    payment_method, deposited_to_account_id, apply_to; createPayment POSTs
 *    /api/v1/accounting/payments
 *  - VERIFY-3 server: createPayment INSERTs accounting.payments (canonical — never RETIRE)
 *  - VERIFY-4: PaymentsListPage + PaymentDetailPage EntityLink customer (both); detail applications
 *    EntityLink invoice; detail header EntityLink account (deposit)
 *
 * payment_applications = 0 (header-only QBO AR projection) is a KNOWN, NAMED remaining gap for
 * apply density — this guard does NOT assert applications density and never will until Neon > 0.
 *
 *   node scripts/verify-acct-surf-04-receive-payment.mjs
 *   node scripts/verify-acct-surf-04-receive-payment.mjs --selftest
 *   PR body Rule 16 labels must use colon form (FIX: included) so check-pr-evidence-body PASS.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-surf-04-receive-payment";

const FILES = {
  map: "docs/trackers/ACCT-08-SURF-SURFACE-MAP-2026-07-25.md",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  subnav: "apps/frontend/src/pages/accounting/subnav-manifest.ts",
  list: "apps/frontend/src/pages/accounting/PaymentsListPage.tsx",
  detail: "apps/frontend/src/pages/accounting/PaymentDetailPage.tsx",
  modal: "apps/frontend/src/pages/accounting/RecordPaymentModal.tsx",
  api: "apps/frontend/src/api/accounting.ts",
  service: "apps/backend/src/accounting/payments.routes.ts",
  topbar: "apps/frontend/src/components/Topbar.tsx",
};

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
  if (!src.map.includes("ACCT-SURF-04") || !src.map.includes("/accounting/payments")) {
    errors.push("frozen map missing ACCT-SURF-04 → /accounting/payments");
  }

  const block = routeBlock(src.manifest, "/accounting/payments");
  if (!block) errors.push("DOD-A: missing route /accounting/payments");
  else {
    if (/ComingSoonPage/.test(block)) {
      errors.push("DOD-A: /accounting/payments must not mount ComingSoonPage");
    }
    if (!block.includes("<PaymentsListPage")) {
      errors.push("DOD-A: /accounting/payments must render <PaymentsListPage />");
    }
  }
  if (!src.subnav.includes("/accounting/payments")) {
    errors.push("DOD-A / NEVER-DELETE: Receive Payment leaf missing from subnav-manifest");
  }

  if (!src.modal.includes("ParityDrawer") || !src.modal.includes("<ParityDrawer")) {
    errors.push("VERIFY-1: RecordPaymentModal must use ParityDrawer");
  }
  if (!src.list.includes("RecordPaymentModal")) {
    errors.push("DOD-A: PaymentsListPage must mount RecordPaymentModal");
  }
  // ACCT-F5055 — Topbar Create→Receive payment must open the drawer via ?create=1.
  if (!src.topbar.includes("/accounting/payments?create=1")) {
    errors.push("VERIFY-1: Topbar Create→Receive payment must navigate to /accounting/payments?create=1");
  }
  if (!/searchParams\.get\(["']create["']\)\s*===\s*["']1["']/.test(src.list)) {
    errors.push("VERIFY-1: PaymentsListPage must honor ?create=1 for RecordPaymentModal");
  }
  if (!/params\.delete\(["']create["']\)/.test(src.list) || !/params\.set\(["']create["'],\s*["']1["']\)/.test(src.list)) {
    errors.push("VERIFY-1: PaymentsListPage must URL-sync create open/close");
  }

  if (!src.modal.includes('createKind="customer"')) {
    errors.push("VERIFY-2: RecordPaymentModal customer picker must use ReferenceSelect createKind=customer");
  }
  if (!src.modal.includes('createKind="account"')) {
    errors.push("VERIFY-2: RecordPaymentModal deposit-to picker must use ReferenceSelect createKind=account");
  }

  for (const needle of [
    "customer_id:",
    "payment_date:",
    "amount_cents:",
    "payment_method:",
    "deposited_to_account_id:",
    "apply_to,",
  ]) {
    if (!src.modal.includes(needle)) {
      errors.push(`DOD-B: RecordPaymentModal submit payload missing ${needle}`);
    }
  }

  if (!src.api.includes("function createPayment")) {
    errors.push("VERIFY-3: missing createPayment API helper");
  } else {
    const idx = src.api.indexOf("function createPayment");
    const slice = src.api.slice(idx, idx + 1500);
    if (!slice.includes("/api/v1/accounting/payments") || !slice.includes("apply_to")) {
      errors.push("VERIFY-3: createPayment must POST /api/v1/accounting/payments with apply_to");
    }
  }

  if (!src.service.includes('app.post("/api/v1/accounting/payments"')) {
    errors.push("VERIFY-3: server must mount POST /api/v1/accounting/payments (canonical, not customers/:id/payments)");
  }
  if (!src.service.includes("INSERT INTO accounting.payments")) {
    errors.push("VERIFY-3: createPayment server must INSERT INTO accounting.payments (canonical)");
  }
  if (/INSERT INTO\s+bank\.payments|INSERT INTO\s+payroll\.payments/i.test(src.service)) {
    errors.push("VERIFY-3: createPayment must not write RETIRE schemas");
  }

  if (!src.list.includes('kind="customer"')) {
    errors.push("VERIFY-4: PaymentsListPage must EntityLink customer");
  }
  if (!src.detail.includes('kind="customer"')) {
    errors.push("VERIFY-4: PaymentDetailPage header must EntityLink customer");
  }
  if (!src.detail.includes('kind="invoice"')) {
    errors.push("VERIFY-4: PaymentDetailPage applications table must EntityLink invoice");
  }
  if (!src.detail.includes('kind="account"')) {
    errors.push("VERIFY-4: PaymentDetailPage header must EntityLink account (deposited_to_account_id)");
  }

  return errors;
}

function selftest() {
  const good = {
    map: "ACCT-SURF-04 `/accounting/payments`",
    manifest: 'path="/accounting/payments"\n<PaymentsListPage />\n',
    subnav: "/accounting/payments",
    list: 'RecordPaymentModal\nkind="customer"\nsearchParams.get("create") === "1"\nparams.set("create", "1")\nparams.delete("create")\n',
    detail: 'kind="customer"\nkind="invoice"\nkind="account"\n',
    modal: [
      "ParityDrawer",
      "<ParityDrawer",
      'createKind="customer"',
      'createKind="account"',
      "customer_id:",
      "payment_date:",
      "amount_cents:",
      "payment_method:",
      "deposited_to_account_id:",
      "apply_to,",
    ].join("\n"),
    api: 'export function createPayment(){ return apiRequest("/api/v1/accounting/payments", { method: "POST", body: { apply_to } }) }',
    service: 'app.post("/api/v1/accounting/payments", async (req, reply) => {});\nINSERT INTO accounting.payments (operating_company_id)',
    topbar: '[t("topbar.create_receive_payment", "Receive payment"), "/accounting/payments?create=1"]',
  };
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(good));
    process.exit(1);
  }
  const thin = { ...good, modal: "export function RecordPaymentModal(){ return <div>thin</div> }" };
  if (!contractErrors(thin).some((e) => e.includes("ParityDrawer"))) {
    console.error(`${LABEL} --selftest FAIL thin modal not caught`);
    process.exit(1);
  }
  const twin = { ...good, manifest: 'path="/accounting/payments"\n<ComingSoonPage />\n' };
  if (!contractErrors(twin).some((e) => e.includes("ComingSoon"))) {
    console.error(`${LABEL} --selftest FAIL ComingSoon twin not caught`);
    process.exit(1);
  }
  const noCustomerLink = {
    ...good,
    list: 'RecordPaymentModal\nsearchParams.get("create") === "1"\nparams.set("create", "1")\nparams.delete("create")\n',
  };
  if (!contractErrors(noCustomerLink).some((e) => e.includes("PaymentsListPage must EntityLink customer"))) {
    console.error(`${LABEL} --selftest FAIL missing customer EntityLink on list not caught`);
    process.exit(1);
  }
  const noCreateDeepLink = { ...good, topbar: '[t("topbar.create_receive_payment", "Receive payment"), "/accounting/payments"]' };
  if (!contractErrors(noCreateDeepLink).some((e) => e.includes("?create=1"))) {
    console.error(`${LABEL} --selftest FAIL Topbar create deep-link not caught`);
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
  `${LABEL}: PASS — ACCT-SURF-04 Receive Payment structural DoD (route+ParityDrawer+payload+canonical accounting.payments+EntityLink customer/invoice/account). payment_applications=0 (header-only QBO AR projection) remains a NAMED gap, not asserted here. Live browser still UNVERIFIED`
);
process.exit(0);

