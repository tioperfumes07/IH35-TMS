#!/usr/bin/env node
/** @matrix-built {"modules":["customers","vendors","drivers","dispatch","fleet","maintenance"],"cols":["connectivity","reverse_link","qbo_chrome"],"leaves":["customer.audit","vendor.audit","driver.audit","load.audit","unit.audit","trailer.audit","work_order.audit"],"task":"CLS-F6937-ENTITY-AUDIT-HISTORY-DISCLOSES-CAP-WITHOUT-PAGER","vertical":"class-sweep"} */
import fs from "node:fs";
const tab = fs.readFileSync("apps/frontend/src/components/audit/EntityAuditHistoryTab.tsx", "utf8");
const consumers = ["pages/CustomerDetail.tsx","pages/VendorDetail.tsx","pages/drivers/DriverProfilePage.tsx","pages/fleet/VehicleProfilePage.tsx","pages/fleet/TrailerProfilePage.tsx","pages/maintenance/WorkOrderDetailPage.tsx"].map((p) => fs.readFileSync(`apps/frontend/src/${p}`, "utf8"));
function failures(source, callers) {
  const out = [];
  for (const token of ["const pageSize = 50", "offset: page * pageSize", "total_count", "setPage((value) => value + 1)", "setPage((value) => Math.max(0, value - 1))", "setPage(0)"]) if (!source.includes(token)) out.push(`${token} missing`);
  if (source.includes("limit: 200")) out.push("legacy first-200 request remains");
  callers.forEach((caller, index) => { if (!caller.includes("EntityAuditHistoryTab")) out.push(`consumer ${index} missing`); });
  return out;
}
// 443.187 (CC-2) repoint — DISP-LDT7 (d2b02e28eb, #20826; owner register LDT-7) replaced the shared tab on the LOAD drawer
// with LoadAuditTab (English sentences, filters). Same rule for that surface: it reads the load's audit through
// GET /api/v1/mdata/loads/:id/audit, which must return the load's full history — never a silent first-N cap.
function loadAuditFailures(drawer, routes) {
  const out = [];
  if (!/<LoadAuditTab\b/.test(drawer)) out.push("load drawer no longer renders LoadAuditTab (or the shared EntityAuditHistoryTab)");
  const at = routes.indexOf('app.get("/api/v1/mdata/loads/:id/audit"');
  const body = at >= 0 ? routes.slice(at, at + 2600) : "";
  if (!body) out.push("GET /api/v1/mdata/loads/:id/audit is gone");
  const sql = (body.match(/FROM audit\.audit_events[\s\S]*?`/) ?? [""])[0];
  if (/\bLIMIT\s+\d+/i.test(sql) && !/\bOFFSET\b/i.test(sql)) out.push("load audit route caps the history with a bare LIMIT (silent first-N, no pager)");
  return out;
}
const drawer = fs.readFileSync("apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx", "utf8");
const loadRoutes = fs.readFileSync("apps/backend/src/mdata/loads.routes.ts", "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [[tab.replace("offset: page * pageSize", "offset: 0"),consumers],[tab.replace("setPage((value) => value + 1)", "setPage(page)"),consumers],[tab.replace("setPage(0)", "void 0"),consumers],[tab,consumers.map((v,i) => i === 3 ? v.replaceAll("EntityAuditHistoryTab","removed") : v)]];
  const missed = mutations.filter(([source, callers]) => failures(source, callers).length === 0);
  if (loadAuditFailures(drawer, loadRoutes).length) { console.error(`FAIL: selftest baseline load-audit: ${loadAuditFailures(drawer, loadRoutes).join("; ")}`); process.exit(1); }
  const capped = loadRoutes.replace(/(FROM audit\.audit_events[\s\S]*?ORDER BY created_at DESC)/, "$1\n          LIMIT 200");
  if (capped === loadRoutes || loadAuditFailures(drawer, capped).length === 0) missed.push(["capped load audit"]);
  if (loadAuditFailures(drawer.replace(/<LoadAuditTab\b/g, "<div"), loadRoutes).length === 0) missed.push(["load audit tab removed"]);
  if (missed.length) { console.error(`FAIL: selftest missed ${missed.length}`); process.exit(1); }
  console.log(`PASS: selftest caught ${mutations.length} audit pager regressions`); process.exit(0);
}
const out = [...failures(tab,consumers), ...loadAuditFailures(drawer, loadRoutes)]; if (out.length) { console.error(`FAIL: ${out.join("; ")}`); process.exit(1); }
console.log("PASS: shared entity audit history has exact server pagination across six profile surfaces, and the load Audit tab reads the full load history");
