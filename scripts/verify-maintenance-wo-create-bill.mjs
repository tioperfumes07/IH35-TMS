#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["ap_bill"],"leafRe":"^(wo\\.create_bill|maintenance\\.modal\\.create_bill)$","task":"ACCT-F5161-MAINTENANCE-WO-CREATE-BILL"} */
/**
 * OWNER-EXECUTION-PLAN §2 money-cells sweep (2026-08-14): wo.create_bill (Work Orders tab, "+ Create
 * Bill") and maintenance.modal.create_bill (the modal itself) are the SAME CreateBillModal.tsx,
 * mounted from both MaintenanceHome.tsx and WorkOrderDetailPage.tsx — a genuine AP-bill create path
 * (createVendorBill), not a theater claim:
 *   - the created bill persists a HARD FK (accounting.bills.work_order_id) to the WO
 *   - Maintenance-Home-opened creates (no WO context) REQUIRE a WO + unit picker before submit
 *     (requireWoLink), so a money event from Maintenance always carries maintenance linkage
 *   - reuses the canonical VendorBillForm (same AP-bill create surface accounting.* uses)
 *
 * Self-test: node scripts/verify-maintenance-wo-create-bill.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/maintenance/components/CreateBillModal.tsx";
const LABEL = "verify-maintenance-wo-create-bill";

export function audit(src) {
  const failures = [];
  if (!/createVendorBill\(operatingCompanyId, payload\)/.test(src)) {
    failures.push(`${FILE}: must call the canonical createVendorBill on submit`);
  }
  if (!/work_order_id: payload\.work_order_id \?\? pickedWoId \?\? linkedWoId/.test(src)) {
    failures.push(`${FILE}: created bill must persist the work_order_id FK (pickedWoId or linkedWoId)`);
  }
  if (!/requireWoLink && !\(linkedWoId \?\? pickedWoId\)/.test(src)) {
    failures.push(`${FILE}: Maintenance-Home-opened creates (requireWoLink) must refuse submit without a WO`);
  }
  if (!/<VendorBillForm/.test(src)) {
    failures.push(`${FILE}: must reuse the canonical VendorBillForm AP-bill create surface`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["submit-call", /createVendorBill\(operatingCompanyId, payload\)/, "createVendorExpense(operatingCompanyId, payload)"],
    ["wo-fk", /work_order_id: payload\.work_order_id \?\? pickedWoId \?\? linkedWoId/, "work_order_id: undefined"],
    ["require-wo-link", /requireWoLink && !\(linkedWoId \?\? pickedWoId\)/, "false"],
    ["vendor-bill-form", /<VendorBillForm/g, "<SomeOtherForm"],
  ];
  for (const [name, pattern, replacement] of mutations) {
    const mutated = good.replace(pattern, replacement);
    if (mutated === good) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Maintenance's Create Bill path is a real, WO-FK-stamped ap_bill create surface`);
