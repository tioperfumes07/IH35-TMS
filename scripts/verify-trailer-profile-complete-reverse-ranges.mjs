#!/usr/bin/env node
/** @matrix-built {"modules":["fleet","maintenance","dispatch"],"cols":["trailer","load","connectivity","reverse_link"],"leaves":["trailer.profile.assignment","trailer.profile.maintenance","load.drawer.assignment_history"],"task":"FLT-F6929-TRAILER-PROFILE-SILENT-20-REVERSE-CAPS","vertical":"class-sweep"} */
import fs from "node:fs";
const SERVICE = "apps/backend/src/mdata/equipment-aggregate.service.ts";
const PROFILE = "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx";
const read = (file) => fs.readFileSync(file, "utf8");
const block = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
export function verify(sources = {}) {
  const service = sources.service ?? read(SERVICE);
  const profile = sources.profile ?? read(PROFILE);
  const loads = block(service, "const loadsRes", "const isReefer");
  const workOrders = block(service, "const woListRes", "maintenance =");
  const checks = [
    ["load assignment source", /dispatch\.load_assignment_history/.test(loads) && /lah\.new_trailer_id = \$1::uuid/.test(loads)],
    ["load company scope", /lah\.operating_company_id = \$2::uuid/.test(loads) && /l\.operating_company_id = lah\.operating_company_id/.test(loads)],
    ["complete linked-load range", !/\bLIMIT\s+\d+/i.test(loads)],
    ["open WO source scope", /w\.equipment_id = \$1::uuid/.test(workOrders) && /w\.operating_company_id = \$2::uuid/.test(workOrders)],
    ["open WO predicate", /w\.voided_at IS NULL/.test(workOrders) && /w\.status NOT IN \('complete', 'completed', 'cancelled'\)/.test(workOrders)],
    ["complete open-WO range", !/\bLIMIT\s+\d+/i.test(workOrders)],
    ["mounted load drills", /tp-section-3b-load-history[\s\S]*?EntityLinkOrTombstone[\s\S]*?kind="load"/.test(profile)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}
if (process.argv.includes("--selftest")) {
  const live = { service: read(SERVICE), profile: read(PROFILE) };
  const loads = block(live.service, "const loadsRes", "const isReefer");
  const wos = block(live.service, "const woListRes", "maintenance =");
  const replaceBlock = (target, mutated) => ({ ...live, service: live.service.replace(target, mutated) });
  const mutations = [
    ["load cap", replaceBlock(loads, loads.replace("ORDER BY linked.updated_at DESC, linked.assigned_at DESC", "ORDER BY linked.updated_at DESC, linked.assigned_at DESC LIMIT 20"))],
    ["WO cap", replaceBlock(wos, wos.replace("ORDER BY COALESCE(w.updated_at, w.opened_at) DESC NULLS LAST", "ORDER BY COALESCE(w.updated_at, w.opened_at) DESC NULLS LAST LIMIT 20"))],
    ["load scope drop", replaceBlock(loads, loads.replace("AND lah.operating_company_id = $2::uuid", "AND TRUE"))],
    ["WO status drop", replaceBlock(wos, wos.replace("AND w.status NOT IN ('complete', 'completed', 'cancelled')", "AND TRUE"))],
  ];
  for (const [name, sources] of mutations) if (verify(sources).length === 0) throw new Error(`selftest did not catch ${name}`);
  console.log(`PASS: selftest caught ${mutations.length} trailer reverse-range regressions`);
} else {
  const failures = verify();
  if (failures.length) { console.error(`FAIL: ${failures.join("; ")}`); process.exit(1); }
  console.log("PASS: Trailer Profile receives complete scoped load and open-WO reverse ranges");
}
