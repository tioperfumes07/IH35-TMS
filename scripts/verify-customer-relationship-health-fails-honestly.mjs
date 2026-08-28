#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = {
  list: "apps/frontend/src/pages/customers/CustomersListView.tsx",
  detail: "apps/frontend/src/components/customers/CustomerRelationshipScore.tsx",
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function verify(sources = {}) {
  const list = sources.list ?? read(REL.list);
  const detail = sources.detail ?? read(REL.detail);
  const checks = [
    ["list defines an explicit unavailable relationship-health state", /if \(unavailable\) return \{ label: "Unavailable"/.test(list)],
    ["list sortable value fails honestly when the complete at-risk read fails", /health_tier_label: relationshipTierBadge\([\s\S]*?atRiskQuery\.isError && !c\.relationship_health_tier[\s\S]*?\)\.label/.test(list)],
    ["list rendered badge uses the same failure contract", /relationshipTierBadge\(tier, atRiskQuery\.isError && !row\.relationship_health_tier\)/.test(list)],
    ["list recomputes rows when query failure state changes", /atRiskCustomerIds, atRiskQuery\.isError/.test(list)],
    ["filter summary cannot claim the failed range loaded", /<p className="text-xs text-slate-600">\s*\{atRiskQuery\.isError\s*\? "Relationship health is unavailable; retry the failed read above\."\s*: `Relationship health loaded for all/.test(list)],
    ["detail badge labels a failed read unavailable", /tierLabel\(score\?\.health_tier, Boolean\(error\)\)/.test(detail)],
    ["detail badge styles a failed read unavailable", /tierClass\(score\?\.health_tier, Boolean\(error\)\)/.test(detail)],
    ["detail preserves retry instead of hiding the failure", /!loading && error && onRetry \? <ListErrorState[\s\S]*?onRetry=\{onRetry\}/.test(detail)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const live = Object.fromEntries(Object.entries(REL).map(([key, rel]) => [key, read(rel)]));
  const mutations = [
    ["list unavailable label removed", { ...live, list: live.list.replace('if (unavailable) return { label: "Unavailable"', 'if (false) return { label: "Unavailable"') }],
    ["sortable rows ignore read failure", { ...live, list: live.list.replace("atRiskQuery.isError && !c.relationship_health_tier", "false") }],
    ["rendered badge ignores read failure", { ...live, list: live.list.replace("atRiskQuery.isError && !row.relationship_health_tier", "false") }],
    ["filter summary claims stale success", { ...live, list: live.list.replace('atRiskQuery.isError\n                  ? "Relationship health is unavailable; retry the failed read above."', 'false\n                  ? "Relationship health is unavailable; retry the failed read above."') }],
    ["detail error badge remains unknown", { ...live, detail: live.detail.replace("tierLabel(score?.health_tier, Boolean(error))", "tierLabel(score?.health_tier)") }],
  ];
  for (const [name, mutated] of mutations) {
    if (verify(mutated).length === 0) throw new Error(`selftest did not catch ${name}`);
  }
  console.log(`PASS: selftest caught ${mutations.length} customer relationship-health honesty regressions`);
} else {
  const failures = verify();
  if (failures.length) {
    console.error(`FAIL: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log("PASS: customer relationship-health failures remain visibly unavailable across list and detail");
}
