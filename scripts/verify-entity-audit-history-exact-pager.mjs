#!/usr/bin/env node
/** @matrix-built {"modules":["customers","vendors","drivers","dispatch","fleet","maintenance"],"cols":["connectivity","reverse_link","qbo_chrome"],"leaves":["customer.audit","vendor.audit","driver.audit","load.audit","unit.audit","trailer.audit","work_order.audit"],"task":"CLS-F6937-ENTITY-AUDIT-HISTORY-DISCLOSES-CAP-WITHOUT-PAGER","vertical":"class-sweep"} */
import fs from "node:fs";
const tab = fs.readFileSync("apps/frontend/src/components/audit/EntityAuditHistoryTab.tsx", "utf8");
const consumers = ["pages/CustomerDetail.tsx","pages/VendorDetail.tsx","pages/drivers/DriverProfilePage.tsx","components/dispatch/LoadDetailDrawer.tsx","pages/fleet/VehicleProfilePage.tsx","pages/fleet/TrailerProfilePage.tsx","pages/maintenance/WorkOrderDetailPage.tsx"].map((p) => fs.readFileSync(`apps/frontend/src/${p}`, "utf8"));
function failures(source, callers) {
  const out = [];
  for (const token of ["const pageSize = 50", "offset: page * pageSize", "total_count", "setPage((value) => value + 1)", "setPage((value) => Math.max(0, value - 1))", "setPage(0)"]) if (!source.includes(token)) out.push(`${token} missing`);
  if (source.includes("limit: 200")) out.push("legacy first-200 request remains");
  callers.forEach((caller, index) => { if (!caller.includes("EntityAuditHistoryTab")) out.push(`consumer ${index} missing`); });
  return out;
}
if (process.argv.includes("--selftest")) {
  const mutations = [[tab.replace("offset: page * pageSize", "offset: 0"),consumers],[tab.replace("setPage((value) => value + 1)", "setPage(page)"),consumers],[tab.replace("setPage(0)", "void 0"),consumers],[tab,consumers.map((v,i) => i === 3 ? v.replaceAll("EntityAuditHistoryTab","removed") : v)]];
  const missed = mutations.filter(([source, callers]) => failures(source, callers).length === 0);
  if (missed.length) { console.error(`FAIL: selftest missed ${missed.length}`); process.exit(1); }
  console.log(`PASS: selftest caught ${mutations.length} audit pager regressions`); process.exit(0);
}
const out = failures(tab,consumers); if (out.length) { console.error(`FAIL: ${out.join("; ")}`); process.exit(1); }
console.log("PASS: shared entity audit history has exact server pagination across seven profile surfaces");
