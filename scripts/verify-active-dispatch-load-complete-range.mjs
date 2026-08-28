#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["load","driver","unit","connectivity","reverse_link"],"leaves":["home.active_movement"],"task":"DSP-F6922-ACTIVE-LOAD-COMPLETE-RANGE","vertical":"class-sweep"} */
/** @matrix-built {"modules":["dispatch"],"cols":["load","driver","unit","connectivity","reverse_link"],"leaves":["overview.oos"],"task":"DSP-F6922-ACTIVE-LOAD-COMPLETE-RANGE","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const live = {
  api: read("apps/frontend/src/api/dispatch.ts"),
  drivers: read("apps/frontend/src/pages/Drivers.tsx"),
  dispatch: read("apps/frontend/src/pages/dispatch/DispatchOverview.tsx"),
  backend: read("apps/backend/src/dispatch/loads.routes.ts"),
};

function verify(s) {
  const checks = [
    ["shared exhaustive scanner", /export async function listAllDispatchLoads/.test(s.api)],
    ["authoritative stable total", /expectedTotal = page\.total_count/.test(s.api) && /page\.total_count !== expectedTotal/.test(s.api)],
    ["deduplicated load IDs", /const seen = new Set<string>\(\)/.test(s.api) && /seen\.add\(load\.id\)/.test(s.api)],
    ["progress-safe offset", /offset \+= page\.loads\.length/.test(s.api) && /page\.loads\.length === 0/.test(s.api)],
    ["deterministic backend range", /ORDER BY sp\.scheduled_arrival_at NULLS LAST, l\.created_at DESC, l\.id DESC/.test(s.backend)],
    ["drivers complete active set", /const dispatchLoadsQuery = useQuery\([\s\S]*?listAllDispatchLoads\(\{[\s\S]*?status: \["assigned_not_dispatched", "dispatched", "in_transit"\]/.test(s.drivers)],
    ["drivers does not cap active state", !/const dispatchLoadsQuery = useQuery\([\s\S]*?listDispatchLoads\(\{[\s\S]*?limit:\s*200/.test(s.drivers)],
    ["availability derives from complete set", /onLoadsCount = useMemo\([\s\S]*?dispatchLoadsQuery\.data\?\.loads/.test(s.drivers) && /availableCount = useMemo/.test(s.drivers)],
    ["dispatch OOS complete active set", /const oosLoadsQ = useQuery\([\s\S]*?listAllDispatchLoads\(\{[\s\S]*?delivered_pending_docs/.test(s.dispatch)],
    ["dispatch OOS filtering preserved", /oosLoadsQ\.data\?\.loads[\s\S]*?filter\(\(load\) => load\.is_dispatch_blocked\)/.test(s.dispatch)],
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
    ["unstable total accepted", { ...live, api: live.api.replace("if (page.total_count !== expectedTotal)", "if (false)") }],
    ["no progress guard", { ...live, api: live.api.replace("if (page.loads.length === 0)", "if (false)") }],
    ["unstable backend order", { ...live, backend: live.backend.replace(", l.id DESC", "") }],
    ["drivers first page", { ...live, drivers: live.drivers.replace("listAllDispatchLoads({", "listDispatchLoads({\n        limit: 200, offset: 0,") }],
    ["OOS first page", { ...live, dispatch: live.dispatch.replace(/(const oosLoadsQ = useQuery\([\s\S]*?)listAllDispatchLoads\(\{/, "$1listDispatchLoads({\n        limit: 50, offset: 0,") }],
    ["OOS predicate lost", { ...live, dispatch: live.dispatch.replace("load.is_dispatch_blocked", "true") }],
  ];
  for (const [label, mutation] of mutations) {
    if (verify(mutation).length === 0) {
      console.error(`verify-active-dispatch-load-complete-range SELFTEST FAILED: mutation survived: ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-active-dispatch-load-complete-range SELFTEST PASS — ${mutations.length} planted defects rejected`);
}

console.log("verify-active-dispatch-load-complete-range PASS — Drivers availability and Dispatch OOS derive from the complete scoped active-load population");
