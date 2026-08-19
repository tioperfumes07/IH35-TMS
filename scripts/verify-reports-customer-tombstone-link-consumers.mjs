#!/usr/bin/env node
/**
 * verify-reports-customer-tombstone-link-consumers.mjs
 * LV-REPORTS-CANCELLATIONS-DEAD-CUSTOMER-TOMBSTONE-LINK
 * LV-REPORTS-DISPATCH-MARGIN-DEAD-CUSTOMER-TOMBSTONE-LINK
 * LV-REPORTS-MANAGEMENT-DEAD-CUSTOMER-TOMBSTONE-LINK
 * LV-LOAD-DETAIL-DEAD-CUSTOMER-TOMBSTONE-LINK
 * LV-DRIVER-PROFILE-DEAD-CUSTOMER-TOMBSTONE-LINK
 *
 * Residual of #8180: unresolved / Unknown customer buckets must not mount
 * EntityLink (dead reverse → Failed to load customer details).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-customer-tombstone-link-consumers";
const LIB = "apps/frontend/src/lib/entity-label.ts";
const CANCELLATIONS = "apps/frontend/src/pages/reports/CancellationsReportPage.tsx";
const DISPATCH = "apps/frontend/src/pages/reports/DispatchMarginPage.tsx";
const MANAGEMENT = "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx";
const LOAD_DETAIL = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";
const DRIVER_LOADS = "apps/frontend/src/components/driver-profile/LoadsSection.tsx";
const ENTITY_LINK_OR_TOMBSTONE = "apps/frontend/src/components/shared/EntityLinkOrTombstone.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

/** @param {{loadDetail?: string, sharedLib?: string}} overrides in-memory content overrides (ACCT-F5552) */
function analyze(overrides = {}) {
  const failures = [];
  const lib = read(LIB);
  if (!/export function isUnresolvedEntityTombstone/.test(lib)) {
    failures.push("entity-label must export isUnresolvedEntityTombstone");
  }
  if (!/\^unknown\\b/i.test(lib) && !/\/\^unknown\\b\/i/.test(lib)) {
    failures.push("isUnresolvedEntityTombstone must treat Unknown … labels as tombstones");
  }

  const canc = read(CANCELLATIONS);
  if (!/isUnresolvedEntityTombstone/.test(canc)) {
    failures.push("CancellationsReportPage must gate EntityLink with isUnresolvedEntityTombstone");
  }
  if (!/cancellations-report-tombstone/.test(canc)) {
    failures.push("CancellationsReportPage must render cancellations-report-tombstone test id");
  }
  if (/entityKind && UUID_KEY\.test\(row\.key\)\s*\?\s*<EntityLink/.test(canc)) {
    failures.push("CancellationsReportPage must not unconditionally EntityLink every UUID bucket key");
  }
  if (!/EntityLink\s+kind=\{entityKind\}/.test(canc) && !/EntityLink kind=\{entityKind\}/.test(canc)) {
    failures.push("CancellationsReportPage must still EntityLink resolvable driver/customer buckets");
  }

  const disp = read(DISPATCH);
  if (!/isUnresolvedCustomerTombstone|isUnresolvedEntityTombstone/.test(disp)) {
    failures.push("DispatchMarginPage must gate customer EntityLink with tombstone predicate");
  }
  if (!/dispatch-margin-customer-tombstone/.test(disp)) {
    failures.push("DispatchMarginPage must render dispatch-margin-customer-tombstone test id");
  }
  if (/render:\s*\(row\)\s*=>\s*<EntityLink\s+kind="customer"\s+id=\{row\.customer_id\}/.test(disp)) {
    failures.push("DispatchMarginPage customer column must not unconditionally mount EntityLink");
  }
  if (!/EntityLink\s+kind="customer"/.test(disp)) {
    failures.push("DispatchMarginPage must still EntityLink resolvable customers");
  }

  const mgmt = read(MANAGEMENT);
  if (!/isUnresolvedEntityTombstone/.test(mgmt) || !/ManagementCustomerCell/.test(mgmt)) {
    failures.push(
      "ManagementReportPackagePage must gate customers via ManagementCustomerCell + isUnresolvedEntityTombstone",
    );
  }
  if (!/ManagementVendorCell/.test(mgmt)) {
    failures.push("ManagementReportPackagePage must gate vendors via ManagementVendorCell");
  }
  if (!/management-report-customer-tombstone/.test(mgmt)) {
    failures.push("ManagementReportPackagePage must render management-report-customer-tombstone test id");
  }
  if (!/management-report-vendor-tombstone/.test(mgmt)) {
    failures.push("ManagementReportPackagePage must render management-report-vendor-tombstone test id");
  }
  const unconditionalCust = (mgmt.match(/<EntityLink\s+kind="customer"\s+id=\{row\.customer_id\}/g) || []).length;
  if (unconditionalCust > 0) {
    failures.push(
      "ManagementReportPackagePage must not unconditionally EntityLink row.customer_id (use ManagementCustomerCell)",
    );
  }
  const unconditionalVend = (mgmt.match(/<EntityLink\s+kind="vendor"\s+id=\{row\.vendor_id\}/g) || []).length;
  if (unconditionalVend > 0) {
    failures.push(
      "ManagementReportPackagePage must not unconditionally EntityLink row.vendor_id (use ManagementVendorCell)",
    );
  }
  if (!/EntityLink\s+kind="customer"/.test(mgmt)) {
    failures.push("ManagementReportPackagePage must still EntityLink resolvable customers");
  }
  if (!/EntityLink\s+kind="vendor"/.test(mgmt)) {
    failures.push("ManagementReportPackagePage must still EntityLink resolvable vendors");
  }

  const loadDetail = overrides.loadDetail ?? read(LOAD_DETAIL);
  // ACCT-F5552: LoadDetailDrawer now delegates its Customer field to the shared
  // <EntityLinkOrTombstone> component (apps/frontend/src/components/shared/EntityLinkOrTombstone.tsx)
  // instead of inlining isUnresolvedEntityTombstone + a raw <EntityLink> itself — a strictly DRYer
  // implementation of the identical guarantee. Trust-but-verify: accept the delegation only if the
  // shared component itself still gates on isUnresolvedEntityTombstone before mounting EntityLink.
  const delegatesToSharedTombstone = /<EntityLinkOrTombstone\b[^>]*\bkind="customer"[^>]*\btombstoneTestId="load-detail-customer-tombstone"[^>]*\/?>/s.test(
    loadDetail,
  ) || /<EntityLinkOrTombstone\b[^>]*\btombstoneTestId="load-detail-customer-tombstone"[^>]*\bkind="customer"[^>]*\/?>/s.test(loadDetail);
  if (delegatesToSharedTombstone) {
    const sharedLib = overrides.sharedLib ?? read(ENTITY_LINK_OR_TOMBSTONE);
    if (!/isUnresolvedEntityTombstone/.test(sharedLib) || !/<EntityLink\b/.test(sharedLib)) {
      failures.push(
        "EntityLinkOrTombstone (delegated to by LoadDetailDrawer) must itself gate with isUnresolvedEntityTombstone before mounting EntityLink",
      );
    }
  } else {
    if (!/isUnresolvedEntityTombstone/.test(loadDetail) || !/load-detail-customer-tombstone/.test(loadDetail)) {
      failures.push("LoadDetailDrawer must tombstone unresolved customers (load-detail-customer-tombstone)");
    }
    if (
      /label:\s*"Customer"[\s\S]{0,220}<EntityLink\s+kind="customer"\s+id=\{load\.customer_id\}/.test(loadDetail) &&
      !/isUnresolvedEntityTombstone\(load\.customer_name, load\.customer_id, "Customer"\)/.test(loadDetail)
    ) {
      failures.push("LoadDetailDrawer Customer field must not unconditionally EntityLink load.customer_id");
    }
    if (!/EntityLink\s+kind="customer"/.test(loadDetail)) {
      failures.push("LoadDetailDrawer must still EntityLink resolvable customers");
    }
  }

  const driverLoads = read(DRIVER_LOADS);
  if (!/isUnresolvedEntityTombstone/.test(driverLoads) || !/driver-profile-load-customer-tombstone/.test(driverLoads)) {
    failures.push("LoadsSection must tombstone unresolved customers (driver-profile-load-customer-tombstone)");
  }
  if (/render:\s*\(row\)\s*=>\s*\(\s*<EntityLink\s+kind="customer"\s+id=\{row\.customer_id\}/.test(driverLoads)) {
    failures.push("LoadsSection customer column must not unconditionally mount EntityLink");
  }
  if (!/EntityLink\s+kind="customer"/.test(driverLoads)) {
    failures.push("LoadsSection must still EntityLink resolvable customers");
  }

  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const cancPath = path.join(process.cwd(), CANCELLATIONS);
  const cancOriginal = fs.readFileSync(cancPath, "utf8");
  try {
    const bad = cancOriginal.replace(
      /if \(isUnresolvedEntityTombstone\(row\.label, row\.key, noun\)\) \{[\s\S]*?return <EntityLink kind=\{entityKind\} id=\{row\.key\} label=\{label\} className="font-medium text-gray-800" \/>;/,
      'return <EntityLink kind={entityKind} id={row.key} label={label} className="font-medium text-gray-800" />;',
    );
    if (bad === cancOriginal) fail("selftest could not plant unconditional cancellations EntityLink");
    fs.writeFileSync(cancPath, bad);
    const planted = analyze();
    if (!planted.some((m) => /CancellationsReportPage|tombstone test id|unconditionally/.test(m))) {
      fail(`selftest expected cancellations fail; got: ${planted.join("; ")}`);
    }
  } finally {
    fs.writeFileSync(cancPath, cancOriginal);
  }

  const dispPath = path.join(process.cwd(), DISPATCH);
  const dispOriginal = fs.readFileSync(dispPath, "utf8");
  try {
    const bad = dispOriginal.replace(
      /render:\s*\(row\)\s*=>\s*\{[\s\S]*?return <EntityLink kind="customer" id=\{row\.customer_id\} label=\{label\} \/>;\s*\},/,
      'render: (row) => <EntityLink kind="customer" id={row.customer_id} label={entityLabel(row.customer_name, row.customer_id, "Customer")} />,',
    );
    if (bad === dispOriginal) fail("selftest could not plant unconditional dispatch EntityLink");
    fs.writeFileSync(dispPath, bad);
    const planted = analyze();
    if (!planted.some((m) => /DispatchMarginPage|unconditionally mount EntityLink|tombstone test id/.test(m))) {
      fail(`selftest expected dispatch fail; got: ${planted.join("; ")}`);
    }
  } finally {
    fs.writeFileSync(dispPath, dispOriginal);
  }

  const mgmtPath = path.join(process.cwd(), MANAGEMENT);
  const mgmtOriginal = fs.readFileSync(mgmtPath, "utf8");
  try {
    let bad = mgmtOriginal.replace(
      /<ManagementCustomerCell customerId=\{row\.customer_id\} customerName=\{row\.customer_name\} \/>/g,
      '<EntityLink kind="customer" id={row.customer_id} label={entityLabel(row.customer_name, row.customer_id, "Customer")} />',
    );
    bad = bad.replace(
      /<ManagementVendorCell vendorId=\{row\.vendor_id\} vendorName=\{row\.vendor_name\} \/>/g,
      '<EntityLink kind="vendor" id={row.vendor_id} label={entityLabel(row.vendor_name, row.vendor_id, "Vendor")} />',
    );
    if (bad === mgmtOriginal) fail("selftest could not plant unconditional management EntityLink");
    fs.writeFileSync(mgmtPath, bad);
    const planted = analyze();
    if (!planted.some((m) => /ManagementReportPackagePage|unconditionally EntityLink/.test(m))) {
      fail(`selftest expected management fail; got: ${planted.join("; ")}`);
    }
  } finally {
    fs.writeFileSync(mgmtPath, mgmtOriginal);
  }

  const loadPath = path.join(process.cwd(), LOAD_DETAIL);
  const loadOriginal = fs.readFileSync(loadPath, "utf8");
  try {
    const bad = loadOriginal
      .replace(/isUnresolvedEntityTombstone/g, "NEVER_TOMBSTONE")
      .replace(/load-detail-customer-tombstone/g, "REMOVED");
    if (bad === loadOriginal) fail("selftest could not plant LoadDetailDrawer tombstone regression");
    fs.writeFileSync(loadPath, bad);
    const planted = analyze();
    if (!planted.some((m) => /LoadDetailDrawer/.test(m))) {
      fail(`selftest expected LoadDetailDrawer fail; got: ${planted.join("; ")}`);
    }
  } finally {
    fs.writeFileSync(loadPath, loadOriginal);
  }

  // ACCT-F5552: prove the trust-but-verify branch actually reads EntityLinkOrTombstone.tsx rather than
  // blindly trusting its name — mutate the SHARED component in-memory only (real LoadDetailDrawer.tsx
  // delegation left untouched on disk) and confirm the guard still catches a regressed guarantee there.
  const sharedLibOriginal = read(ENTITY_LINK_OR_TOMBSTONE);
  const sharedLibBad = sharedLibOriginal.replace(/isUnresolvedEntityTombstone/g, "NEVER_TOMBSTONE");
  if (sharedLibBad === sharedLibOriginal) fail("selftest could not plant EntityLinkOrTombstone tombstone regression");
  const plantedShared = analyze({ sharedLib: sharedLibBad });
  if (!plantedShared.some((m) => /EntityLinkOrTombstone/.test(m))) {
    fail(`selftest expected EntityLinkOrTombstone fail; got: ${plantedShared.join("; ")}`);
  }

  const driverPath = path.join(process.cwd(), DRIVER_LOADS);
  const driverOriginal = fs.readFileSync(driverPath, "utf8");
  try {
    const bad = driverOriginal.replace(
      /render:\s*\(row\)\s*=>\s*\{[\s\S]*?return <EntityLink kind="customer" id=\{row\.customer_id\} label=\{label\} \/>;\s*\},/,
      'render: (row) => (\n      <EntityLink\n        kind="customer"\n        id={row.customer_id}\n        label={entityLabel(row.customer_name, row.customer_id, "Customer")}\n      />\n    ),',
    );
    if (bad === driverOriginal) fail("selftest could not plant LoadsSection unconditional EntityLink");
    fs.writeFileSync(driverPath, bad);
    const planted = analyze();
    if (!planted.some((m) => /LoadsSection/.test(m))) {
      fail(`selftest expected LoadsSection fail; got: ${planted.join("; ")}`);
    }
  } finally {
    fs.writeFileSync(driverPath, driverOriginal);
  }

  const good = analyze();
  if (good.length) fail(`selftest expected GOOD: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = analyze();
if (failures.length) fail(failures.join("; "));
console.log(
  `${LABEL} PASS — cancellations + dispatch-margin + management-report + load-detail + driver-profile load tombstone consumers are non-interactive`,
);
