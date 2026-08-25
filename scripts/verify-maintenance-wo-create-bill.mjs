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
const DETAIL = "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx";
const LABEL = "verify-maintenance-wo-create-bill";

export function audit(src, detailSrc = "") {
  const failures = [];
  // LINK-F5188 added an idempotency-key 3rd argument to the createVendorBill call
  // (createVendorBill(operatingCompanyId, payload, { idempotencyKey: ... })) — the anchored
  // "…payload)" form below never matches that real, correct call shape. Not end-anchored: a
  // trailing 3rd argument is a legitimate call-site enhancement, not a different function.
  if (!/createVendorBill\(operatingCompanyId, payload/.test(src)) {
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
  if (detailSrc) {
    if (!/<CreateBillModal[\s\S]*linkedWoId=\{id\}[\s\S]*linkedUnitId=\{/.test(detailSrc)) {
      failures.push(
        `${DETAIL}: WO + Create Bill must pass linkedUnitId from wo.unit_id (WO-CREATE-BILL-MODAL-DROPS-UNIT-PREFILL)`,
      );
    }
    if (!/linkedUnitId=\{wo\.unit_id \?\? undefined\}/.test(detailSrc)) {
      failures.push(`${DETAIL}: linkedUnitId must be the WO unit UUID, not a picker-only path`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const goodDetail = fs.readFileSync(path.join(ROOT, DETAIL), "utf8");
  if (audit(good, goodDetail).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good, goodDetail).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["submit-call", good, /createVendorBill\(operatingCompanyId, payload/, "createVendorExpense(operatingCompanyId, payload", goodDetail],
    ["wo-fk", good, /work_order_id: payload\.work_order_id \?\? pickedWoId \?\? linkedWoId/, "work_order_id: undefined", goodDetail],
    ["require-wo-link", good, /requireWoLink && !\(linkedWoId \?\? pickedWoId\)/, "false", goodDetail],
    ["vendor-bill-form", good, /<VendorBillForm/g, "<SomeOtherForm", goodDetail],
    [
      "wo-detail-unit-prefill",
      good,
      null,
      null,
      goodDetail.replace(/linkedUnitId=\{wo\.unit_id \?\? undefined\}\n/, ""),
    ],
  ];
  for (const [name, modalSrc, pattern, replacement, detailSrc] of mutations) {
    const mutatedModal = pattern ? modalSrc.replace(pattern, replacement) : modalSrc;
    const mutatedDetail = detailSrc;
    if (pattern && mutatedModal === modalSrc) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (!pattern && mutatedDetail === goodDetail) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: detail mutation did not apply`);
      process.exit(1);
    }
    if (audit(mutatedModal, mutatedDetail).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(
  fs.readFileSync(path.join(ROOT, FILE), "utf8"),
  fs.readFileSync(path.join(ROOT, DETAIL), "utf8"),
);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Maintenance's Create Bill path is a real, WO-FK-stamped ap_bill create surface`);
