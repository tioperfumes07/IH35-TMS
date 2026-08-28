#!/usr/bin/env node
/** @matrix-built {"modules":["fleet","maintenance"],"cols":["unit","connectivity","reverse_link"],"leaves":["unit.profile.maintenance","work_orders.list"],"task":"MAINT-F6928-UNIT-SNAPSHOT-OPEN-WO-AFTER-CAP","vertical":"class-sweep"} */
import fs from "node:fs";
const SERVICE = "apps/backend/src/mdata/unit-aggregate.service.ts";
const VIEW = "apps/frontend/src/components/vehicle-profile/MaintenanceSnapshotSection.tsx";
const read = (file) => fs.readFileSync(file, "utf8");

function query(source) {
  return source.match(/const recentWoRes = await client\.query\([\s\S]*?\n  \);/)?.[0] ?? "";
}
export function verify(sources = {}) {
  const service = sources.service ?? read(SERVICE);
  const view = sources.view ?? read(VIEW);
  const sql = query(service);
  const checks = [
    ["unit and company scope", /w\.unit_id = \$1::uuid/.test(sql) && /w\.operating_company_id = \$2::uuid/.test(sql)],
    ["void exclusion", /w\.voided_at IS NULL/.test(sql)],
    ["canonical open statuses", /w\.status IN \('open', 'in_progress', 'awaiting_parts', 'awaiting_approval', 'scheduled'\)/.test(sql)],
    ["complete open range", !/\bLIMIT\s+\d+/i.test(sql)],
    ["stable order", /ORDER BY COALESCE\(w\.updated_at, w\.opened_at\) DESC NULLS LAST/.test(sql)],
    ["mounted work-order drills", /EntityLinkOrTombstone[\s\S]*?kind="work_order"/.test(view)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}
if (process.argv.includes("--selftest")) {
  const live = { service: read(SERVICE), view: read(VIEW) };
  const target = query(live.service);
  const mutateQuery = (from, to) => ({ ...live, service: live.service.replace(target, target.replace(from, to)) });
  const mutations = [
    ["post-query cap", mutateQuery("ORDER BY COALESCE(w.updated_at, w.opened_at) DESC NULLS LAST", "ORDER BY COALESCE(w.updated_at, w.opened_at) DESC NULLS LAST\n      LIMIT 10")],
    ["closed rows before filter", mutateQuery("AND w.status IN ('open', 'in_progress', 'awaiting_parts', 'awaiting_approval', 'scheduled')", "AND TRUE")],
    ["dropped unit scope", mutateQuery("WHERE w.unit_id = $1::uuid", "WHERE TRUE")],
  ];
  for (const [name, sources] of mutations) if (verify(sources).length === 0) throw new Error(`selftest did not catch ${name}`);
  console.log(`PASS: selftest caught ${mutations.length} unit snapshot regressions`);
} else {
  const failures = verify();
  if (failures.length) { console.error(`FAIL: ${failures.join("; ")}`); process.exit(1); }
  console.log("PASS: unit Maintenance Snapshot receives the complete scoped open-WO range");
}
