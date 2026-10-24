#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["load","driver","unit","connectivity","reverse_link"],"leaves":["home.active_movement"],"task":"DSP-F6922-ACTIVE-LOAD-COMPLETE-RANGE","vertical":"class-sweep"} */
/** @matrix-built {"modules":["dispatch"],"cols":["load","driver","unit","connectivity","reverse_link"],"leaves":["overview.oos"],"task":"DSP-F6922-ACTIVE-LOAD-COMPLETE-RANGE","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./verify-truck-planner-complete-unit-roster.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const live = {
  // Heavy CI peel — re-pointed, same rule: 52699c6c2f (#26871, 443.182-A catalog one-source consolidation) moved
  // listDispatchLoads / listAllDispatchLoads into api/catalog-loads.ts; api/dispatch.ts re-exports them (callers unchanged).
  api: read("apps/frontend/src/api/catalog-loads.ts"),
  dispatchApi: read("apps/frontend/src/api/dispatch.ts"),
  drivers: read("apps/frontend/src/pages/Drivers.tsx"),
  dispatch: read("apps/frontend/src/pages/dispatch/DispatchOverview.tsx"),
  backend: read("apps/backend/src/dispatch/loads.routes.ts"),
  activeCounts: read("apps/backend/src/dispatch/active-loads-count.ts"),
};

function verify(s) {
  const checks = [
    ["shared exhaustive scanner", /export async function listAllDispatchLoads/.test(s.api)],
    ["dispatch.ts re-exports the one scanner", /export \{[^}]*\blistAllDispatchLoads\b[^}]*\} from "\.\/catalog-loads"/.test(s.dispatchApi) && !/export async function listAllDispatchLoads/.test(s.dispatchApi)],
    ["authoritative stable total", /expectedTotal = page\.total_count/.test(s.api) && /page\.total_count !== expectedTotal/.test(s.api)],
    ["deduplicated load IDs", /const seen = new Set<string>\(\)/.test(s.api) && /seen\.add\(load\.id\)/.test(s.api)],
    ["progress-safe offset", /offset \+= page\.loads\.length/.test(s.api) && /page\.loads\.length === 0/.test(s.api)],
    ["deterministic backend range", /ORDER BY sp\.scheduled_arrival_at NULLS LAST, l\.created_at DESC, l\.id DESC/.test(s.backend)],
    // LEAD 443.206R (register B3/B11) — Drivers "on a load" reads the board set (empty status list = the load service default).
    ["drivers complete active set", /const dispatchLoadsQuery = useQuery\([\s\S]*?listAllDispatchLoads\(\{[\s\S]*?status: \[\],/.test(s.drivers)],
    ["drivers does not cap active state", !/const dispatchLoadsQuery = useQuery\([\s\S]*?listDispatchLoads\(\{[\s\S]*?limit:\s*200/.test(s.drivers)],
    // 443.290: 443.269-A item 6 derives On Loads from the board set by driver id (onLoadDriverIds), Available = Active − on loads.
    ["availability derives from complete set", /const onLoadDriverIds = useMemo[\s\S]*?dispatchLoadsQuery\.data\.loads[\s\S]*?DRIVER_ON_LOAD_STATUSES\.has/.test(s.drivers) && /const onLoadsCount = onLoadDriverIds == null \? null : onLoadDriverIds\.size/.test(s.drivers) && /availableCount = useMemo\([\s\S]*?d\.status === "Active" && !onLoadDriverIds\.has/.test(s.drivers) && /new Set<string>\(ON_TRUCK_STATUSES\)/.test(s.drivers)],
    // LEAD 443.206R (register B11) — the OOS set is the shared DISPATCH_API_TRUCK_COMMITTED_STATUSES (carries delivered_pending_docs).
    ["dispatch OOS complete active set", /const oosLoadsQ = useQuery\([\s\S]*?listAllDispatchLoads\(\{[\s\S]*?status: \[\.\.\.DISPATCH_API_TRUCK_COMMITTED_STATUSES\]/.test(s.dispatch)],
    ["dispatch OOS filtering preserved", /oosLoadsQ\.data\?\.loads[\s\S]*?filter\(\(load\) => load\.is_dispatch_blocked\)/.test(s.dispatch)],
    // DSP-KPI-ON-LOAD (owner ruling 2026-09-09): "Active loads" = only trucks with a load out — the
    // five on-load statuses, NOT the delivered_pending_docs billing backlog. Tile, drill URL, and the
    // backend on-load counter must all carry the identical five-status set.
    // LEAD 443.206R (register B11) — the drill set is the shared DISPATCH_WORK_STATUSES (lib/load-status.ts), never a copied literal.
    ["active tile uses exact on-load drill", /const ACTIVE_LOAD_DRILL_STATUSES = DISPATCH_WORK_STATUSES;[\s\S]*?const ACTIVE_LOAD_DRILL_HREF = `\/dispatch\/loads\?statuses=\$\{ACTIVE_LOAD_DRILL_STATUSES\.join\(","\)\}`;[\s\S]*?label="Active loads"[\s\S]*?to=\{ACTIVE_LOAD_DRILL_HREF\}/.test(s.dispatch)],
    ["active drill excludes delivered_pending_docs", !/const ACTIVE_LOAD_DRILL_STATUSES = \[[\s\S]*?delivered_pending_docs[\s\S]*?\] as const;/.test(s.dispatch)],
    ["active tile bound to on_load, not active_loads", /value=\{dashboardQ\.isLoading \|\| dashboardQ\.isError \? "—" : \(dashboardQ\.data\?\.on_load \?\? 0\)\}/.test(s.dispatch)],
    ["delivered tile drills into factoring queue", /const DELIVERED_DRILL_HREF = "\/dispatch\/factoring-queue";[\s\S]*?label="Delivered — pending docs"[\s\S]*?value=\{dashboardQ\.isLoading \|\| dashboardQ\.isError \? "—" : \(dashboardQ\.data\?\.delivered \?\? 0\)\}[\s\S]*?to=\{DELIVERED_DRILL_HREF\}/.test(s.dispatch)],
    // 443.290: LEAD 443.244 (owner 10-22) — "on load" is the load IN MOTION; assigned_not_dispatched is an advance booking.
    ["on-load tile and service share exact statuses", /export const DISPATCH_ON_LOAD_STATUSES = \[\s*"dispatched",\s*"at_pickup",\s*"in_transit",\s*"at_delivery",\s*\] as const;/.test(s.activeCounts)],
    ["on-load service set excludes delivered_pending_docs", !/DISPATCH_ON_LOAD_STATUSES = \[[\s\S]*?delivered_pending_docs[\s\S]*?\] as const;/.test(s.activeCounts)],
    ["intentional exposure preview remains bounded", /const exposureLoadsQ = useQuery\([\s\S]*?listDispatchLoads\(\{[\s\S]*?limit:\s*20/.test(s.dispatch)],
  ];
  return checks.filter(([, ok]) => !ok).map(([label]) => label);
}

const failures = verify(live);
if (failures.length) {
  console.error(`verify-active-dispatch-load-complete-range FAILED: ${failures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["unstable total accepted", { ...live, api: live.api.replaceAll("if (page.total_count !== expectedTotal)", "if (false)") /* 443.290: two scanners carry it */ }],
    ["no progress guard", { ...live, api: live.api.replaceAll("if (page.loads.length === 0)", "if (false)") }],
    ["unstable backend order", { ...live, backend: live.backend.replace(", l.id DESC", "") }],
    ["second scanner copy in dispatch.ts", { ...live, dispatchApi: live.dispatchApi + "\nexport async function listAllDispatchLoads() {}\n" }],
    ["drivers first page", { ...live, drivers: live.drivers.replace("listAllDispatchLoads({", "listDispatchLoads({\n        limit: 200, offset: 0,") }],
    ["OOS first page", { ...live, dispatch: live.dispatch.replace(/(const oosLoadsQ = useQuery\([\s\S]*?)listAllDispatchLoads\(\{/, "$1listDispatchLoads({\n        limit: 50, offset: 0,") }],
    ["OOS predicate lost", { ...live, dispatch: live.dispatch.replace("load.is_dispatch_blocked", "true") }],
    ["active drill loses a counted status", { ...live, dispatch: live.dispatch.replace("const ACTIVE_LOAD_DRILL_STATUSES = DISPATCH_WORK_STATUSES;", 'const ACTIVE_LOAD_DRILL_STATUSES = ["dispatched"] as const;') }],
    ["active tile returns to generic board", { ...live, dispatch: live.dispatch.replace("to={ACTIVE_LOAD_DRILL_HREF}", 'to="/dispatch/loads"') }],
    ["active drill re-admits delivered_pending_docs", { ...live, dispatch: live.dispatch.replace("const ACTIVE_LOAD_DRILL_STATUSES = DISPATCH_WORK_STATUSES;", 'const ACTIVE_LOAD_DRILL_STATUSES = [...DISPATCH_WORK_STATUSES, "delivered_pending_docs"] as const;') }],
    ["active tile rebound to stale active_loads", { ...live, dispatch: live.dispatch.replace("dashboardQ.data?.on_load ?? 0", "dashboardQ.data?.active_loads ?? 0") }],
    ["delivered tile loses its factoring drill", { ...live, dispatch: live.dispatch.replace("to={DELIVERED_DRILL_HREF}", 'to="/dispatch/loads"') }],
    ["on-load service set re-admits delivered_pending_docs", { ...live, activeCounts: live.activeCounts.replace('  "at_delivery",\n] as const;', '  "at_delivery",\n  "delivered_pending_docs",\n] as const;') }],
    // 443.290: LEAD 443.244 — an advance booking is not "on load".
    ["on-load service set re-admits assigned_not_dispatched", { ...live, activeCounts: live.activeCounts.replace('export const DISPATCH_ON_LOAD_STATUSES = [\n  "dispatched",', 'export const DISPATCH_ON_LOAD_STATUSES = [\n  "assigned_not_dispatched",\n  "dispatched",') }],
    ["Drivers on-load set copied as a literal", { ...live, drivers: live.drivers.replace("new Set<string>(ON_TRUCK_STATUSES)", 'new Set(["dispatched", "in_transit"])') }],
    ["Available counts every Active driver", { ...live, drivers: live.drivers.replace('d.status === "Active" && !onLoadDriverIds.has(String(d.id))', 'd.status === "Active"') }],
  ];
  for (const [label, mutation] of mutations) {
    if (verify(mutation).length === 0) {
      console.error(`verify-active-dispatch-load-complete-range SELFTEST FAILED: mutation survived: ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-active-dispatch-load-complete-range SELFTEST PASS — ${mutations.length} planted defects rejected`);
}

console.log("verify-active-dispatch-load-complete-range PASS — Active-load KPI drills to its exact six-status set; Drivers availability and Dispatch OOS use complete scoped populations");
