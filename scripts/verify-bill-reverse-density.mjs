#!/usr/bin/env node
/**
 * ACCT-F04 / ACCT-LINK-03 — reverse-density wiring guard.
 *
 * Asserts by-unit / by-claim / by-WO bills reverse endpoints exist (entity-scoped),
 * FE clients call them, and Claim/Unit reverse surfaces render EntityLinks.
 * Does NOT invent Neon density — density>0 requires ops create with FKs stamped.
 *
 *   node scripts/verify-bill-reverse-density.mjs
 *   node scripts/verify-bill-reverse-density.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bill-reverse-density";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8");
}

function contractErrors(sources) {
  const errors = [];
  const { service, routes, api, claimsTab, unitTab, woDetail, billDetail, form } = sources;

  for (const fn of ["listWorkOrderLinkedFinancials", "listClaimLinkedFinancials", "listUnitLinkedFinancials"]) {
    if (!service.includes(`export async function ${fn}`)) {
      errors.push(`bills.service must export ${fn}`);
    }
  }

  for (const route of [
    "/api/v1/accounting/work-orders/:id/linked-financials",
    "/api/v1/accounting/claims/:id/linked-financials",
    "/api/v1/accounting/units/:id/linked-financials",
  ]) {
    if (!routes.includes(route)) {
      errors.push(`bills.routes must mount GET ${route}`);
    }
  }

  for (const frag of [
    "b.operating_company_id = $1",
    "e.operating_company_id = $1",
    "AND b.unit_id = $2",
    "AND b.insurance_claim_id = $2",
    "AND b.linked_work_order_uuid = $2",
  ]) {
    if (!service.includes(frag)) {
      errors.push(`backend reverse queries must stay entity-scoped / FK-keyed (${frag})`);
    }
  }

  for (const fn of ["listWorkOrderLinkedFinancials", "listClaimLinkedFinancials", "listUnitLinkedFinancials"]) {
    if (!api.includes(`export function ${fn}`)) {
      errors.push(`frontend api/accounting.ts must export ${fn}`);
    }
  }

  if (!api.includes("insurance_claim_id?: string")) {
    errors.push("createVendorBill body must accept insurance_claim_id");
  }

  if (!form.includes("linkedClaimId") || !form.includes("insurance_claim_id: linkedClaimId")) {
    errors.push("VendorBillForm must stamp insurance_claim_id when linkedClaimId is set");
  }

  if (!claimsTab.includes('kind="bill"') || !claimsTab.includes("graph.reverse.bills")) {
    errors.push("ClaimsTab must reverse-drill bills from claim graph");
  }

  if (!unitTab.includes("listUnitLinkedFinancials") || !unitTab.includes('data-testid="unit-linked-financials"')) {
    errors.push("UnitFinanceLinkageTab must surface unit-linked bills/expenses");
  }

  if (
    !woDetail.includes("listWorkOrderLinkedFinancials") ||
    !woDetail.includes('data-testid="wo-linked-financials"') ||
    !woDetail.includes('tableTestId="wo-detail-linked-bills-parity"')
  ) {
    errors.push("WorkOrderDetailPage must reverse-drill linked bills/expenses via listWorkOrderLinkedFinancials");
  }

  for (const needle of [
    'bill.unit_id ?',
    'kind="unit"',
    'bill.linked_work_order_uuid ?',
    'kind="work_order"',
    "bill.insurance_claim_id ?",
    'kind="claim"',
  ]) {
    if (!billDetail.includes(needle)) {
      errors.push(`BillDetailPage must reverse-drill bill→unit/claim/WO (${needle})`);
    }
  }

  if (!api.includes("insurance_claim_id?: string | null")) {
    errors.push("VendorBill type must expose insurance_claim_id for bill-detail reverse drill");
  }

  return errors;
}

function selftest(sources) {
  const good = contractErrors(sources);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, good);
    process.exit(1);
  }
  const mutations = [
    ["drop unit route", { ...sources, routes: sources.routes.replaceAll("/api/v1/accounting/units/:id/linked-financials", "/api/v1/accounting/units/:id/missing") }],
    ["drop unit service", { ...sources, service: sources.service.replaceAll("listUnitLinkedFinancials", "listUnitHidden") }],
    ["drop claim UI", { ...sources, claimsTab: sources.claimsTab.replaceAll("graph.reverse.bills", "graph.reverse.hidden") }],
    ["drop WO UI", { ...sources, woDetail: sources.woDetail.replaceAll("listWorkOrderLinkedFinancials", "listWorkOrderHidden") }],
    ["drop bill→claim drill", { ...sources, billDetail: sources.billDetail.replaceAll('kind="claim"', 'kind="hidden"') }],
  ];
  for (const [name, mutated] of mutations) {
    if (contractErrors(mutated).length === 0) {
      console.error(`${LABEL} --selftest FAIL inert mutation: ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL}: selftest PASS`);
}

const sources = {
  service: read("apps/backend/src/accounting/bills.service.ts"),
  routes: read("apps/backend/src/accounting/bills.routes.ts"),
  api: read("apps/frontend/src/api/accounting.ts"),
  claimsTab: read("apps/frontend/src/pages/insurance/ClaimsTab.tsx"),
  unitTab: read("apps/frontend/src/pages/units/UnitFinanceLinkageTab.tsx"),
  woDetail: read("apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx"),
  billDetail: read("apps/frontend/src/pages/accounting/BillDetailPage.tsx"),
  form: read("apps/frontend/src/components/accounting/VendorBillForm.tsx"),
};

if (process.argv.includes("--selftest")) {
  selftest(sources);
  process.exit(0);
}

const errors = contractErrors(sources);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — by-unit/by-claim/by-WO reverse endpoints + UI wired (density is ops, not this guard)`);
process.exit(0);
