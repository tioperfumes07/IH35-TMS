#!/usr/bin/env node
/**
 * D-H0 / ROUND 312 — Owner/Admin lock override must propagate (not warn-only):
 * - full override path (override_reason >=10) exists for Owner|Administrator
 * - audit event dispatch.load_edit_lock_overridden carries override_reason
 * - invoice refuse when sent/paid/synced; draft re-derive on rate change
 * - driver bill refuse when on closed settlement; else re-derive
 * - stop moves: geocode + miles re-rate + E-25 fence bind
 * - trip_type change surfaces SET-01 presettlement re-link
 * - Edit Load UI amber Owner override banner + reason box
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-owner-lock-override-propagates";

const FILES = {
  service: path.join(ROOT, "apps/backend/src/dispatch/update-load.service.ts"),
  propagation: path.join(ROOT, "apps/backend/src/dispatch/owner-lock-override-propagation.service.ts"),
  routes: path.join(ROOT, "apps/backend/src/dispatch/loads.routes.ts"),
  modal: path.join(ROOT, "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx"),
  api: path.join(ROOT, "apps/frontend/src/api/loads.ts"),
};

function read(p) {
  return fs.readFileSync(p, "utf8");
}

export function assertOwnerLockOverridePropagates(srcs) {
  const fails = [];
  const { service, propagation, routes, modal, api } = srcs;

  if (!/export function isOwnerFullLockOverridePatch/.test(service)) {
    fails.push("update-load.service.ts must export isOwnerFullLockOverridePatch");
  }
  if (!/dispatch\.load_edit_lock_overridden/.test(service)) {
    fails.push("full override must audit dispatch.load_edit_lock_overridden");
  }
  if (!/override_reason/.test(service) || !/before_after/.test(service)) {
    fails.push("override audit must carry override_reason and before_after diff");
  }
  if (!/runOwnerLockOverridePropagation/.test(service)) {
    fails.push("updateDispatchLoad must call runOwnerLockOverridePropagation on full override");
  }
  if (!/linkLoadToPresettlementAfterAssignmentInClientTx/.test(service)) {
    fails.push("updateDispatchLoad must re-enter SET-01 linker (presettlement)");
  }

  if (!/assertInvoiceAllowsRateOverride/.test(propagation)) {
    fails.push("propagation must assertInvoiceAllowsRateOverride before rate mutate");
  }
  if (!/invoice_paid_or_synced_void_and_reissue/.test(propagation)) {
    fails.push("propagation must refuse with invoice_paid_or_synced_void_and_reissue");
  }
  if (!/resyncProformaInvoiceFromLoadRate/.test(propagation)) {
    fails.push("draft invoice must re-derive via resyncProformaInvoiceFromLoadRate");
  }
  if (!/assertDriverBillAllowsPayOverride/.test(propagation)) {
    fails.push("propagation must assertDriverBillAllowsPayOverride before pay mutate");
  }
  if (!/driver_bill_settled_adjust_on_next_settlement/.test(propagation)) {
    fails.push("propagation must refuse with driver_bill_settled_adjust_on_next_settlement");
  }
  if (!/ensureDriverBillArtifactsForLoad/.test(propagation)) {
    fails.push("open driver bill must re-derive via ensureDriverBillArtifactsForLoad");
  }
  if (!/rerateLoadMilesFromStops/.test(propagation)) {
    fails.push("stop moves must re-rate practical/short miles via rerateLoadMilesFromStops");
  }
  if (!/bindLoadToGeofences/.test(propagation)) {
    fails.push("stop moves must re-bind E-25 fences via bindLoadToGeofences");
  }
  if (!/presettlement_relinked/.test(propagation)) {
    fails.push("trip_type change must surface presettlement_relinked propagation item");
  }
  // Audit without reason is forbidden: full override gate requires reason length >= 10
  if (!/reason\.length < 10/.test(service) && !/trim\(\)\.length < 10/.test(service)) {
    fails.push("isOwnerFullLockOverridePatch must require override_reason length >= 10");
  }

  if (!/OwnerLockPropagationRefuseError/.test(routes)) {
    fails.push("loads.routes.ts must map OwnerLockPropagationRefuseError to 409");
  }
  if (!/void_and_reissue/.test(routes)) {
    fails.push("refuse response must point at void_and_reissue");
  }
  if (!/edit-lock/.test(routes)) {
    fails.push("GET /dispatch/loads/:id/edit-lock must exist");
  }

  if (!/owner-lock-override-banner/.test(modal)) {
    fails.push("BookLoadModalV4 must render Owner override amber banner");
  }
  if (!/owner-lock-override-reason/.test(modal)) {
    fails.push("BookLoadModalV4 must collect override reason (10+)");
  }
  if (!/lock_override_propagation/.test(modal)) {
    fails.push("Edit save must surface lock_override_propagation toasts");
  }
  if (!/getDispatchLoadEditLock/.test(api)) {
    fails.push("frontend api/loads.ts must export getDispatchLoadEditLock");
  }

  return fails;
}

if (process.argv.includes("--selftest")) {
  const srcs = {
    service: read(FILES.service),
    propagation: read(FILES.propagation),
    routes: read(FILES.routes),
    modal: read(FILES.modal),
    api: read(FILES.api),
  };
  if (assertOwnerLockOverridePropagates(srcs).length) {
    console.error(`${LABEL} SELFTEST FAIL — current sources should pass`);
    for (const f of assertOwnerLockOverridePropagates(srcs)) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  const bad = {
    ...srcs,
    propagation: srcs.propagation.replaceAll("resyncProformaInvoiceFromLoadRate", "NOPE"),
  };
  if (!assertOwnerLockOverridePropagates(bad).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted missing re-derive should fail`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
  process.exit(0);
}

const fails = assertOwnerLockOverridePropagates({
  service: read(FILES.service),
  propagation: read(FILES.propagation),
  routes: read(FILES.routes),
  modal: read(FILES.modal),
  api: read(FILES.api),
});
if (fails.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
