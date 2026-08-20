#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["unit","connectivity","reverse_link"],"leafRe":"^damage_reports\\.intake$","task":"ACCT-F5667-MAINTENANCE-DAMAGE-REGISTER-TOMBSTONES","vertical":"column-wave"} */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/maintenance/components/MaintenanceDamageRegisterTab.tsx";
const live = fs.readFileSync(FILE, "utf8");

function failures(src) {
  const problems = [];
  if (!/<EntityLinkOrTombstone kind="unit" id=\{row\.unit_id\} name=\{row\.unit_number\} noun="Unit"/.test(src)) {
    problems.push("unit FK/name pair is not tombstone-safe");
  }
  if (!/<EntityLinkOrTombstone[\s\S]{0,120}kind="work_order"[\s\S]{0,120}id=\{row\.work_order_id\}[\s\S]{0,120}name=\{row\.work_order_display_id\}[\s\S]{0,80}noun="Work order"/.test(src)) {
    problems.push("work-order FK/name pair is not tombstone-safe");
  }
  if (/label=\{entityLabel\(row\.(unit_number|work_order_display_id)/.test(src)) {
    problems.push("damage register still exposes active UUID-fallback related-record links");
  }
  if (!/listSafetyIncidents\(operatingCompanyId, "damage_report"\)/.test(src)) {
    problems.push("damage register lost its company-scoped canonical read");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    live.replace('kind="unit"', 'kind="driver"'),
    live.replace("name={row.unit_number}", "name={row.unit_id}"),
    live.replace("name={row.work_order_display_id}", "name={row.work_order_id}"),
    live.replace('listSafetyIncidents(operatingCompanyId, "damage_report")', 'listSafetyIncidents("", "damage_report")'),
  ];
  const missed = mutations.filter((src) => failures(src).length === 0).length;
  if (missed) throw new Error(`selftest missed ${missed}/4 planted defects`);
  console.log("verify-maintenance-damage-register-tombstones selftest PASS (4/4)");
  process.exit(0);
}

const problems = failures(live);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("verify-maintenance-damage-register-tombstones PASS");
