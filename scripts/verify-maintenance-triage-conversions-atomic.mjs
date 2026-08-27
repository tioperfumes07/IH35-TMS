#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/backend/src/maintenance/triage.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const locks = (candidate.match(/LIMIT 1\s+FOR UPDATE/g) ?? []).length;
  const limiters = (candidate.match(/convert-to-(?:wo|damage)"[\s\S]{0,160}rateLimit:\s*\{\s*max:\s*60,\s*timeWindow:\s*"1 minute"/g) ?? []).length;
  const nullCas = (candidate.match(/UPDATE dispatch\.intransit_issues[\s\S]{0,260}promoted_to_wo_id IS NULL[\s\S]{0,100}promoted_to_damage_report_id IS NULL[\s\S]{0,80}RETURNING id::text/g) ?? []).length;
  const checks = [
    ["both route limiters", limiters === 2],
    ["both source row locks", locks === 2],
    ["work-order insert truth", /if \(!workOrderId\) throw new Error\("triage_work_order_insert_failed"\)/.test(candidate)],
    ["damage-report insert truth", /if \(!damageReportId\) throw new Error\("triage_damage_report_insert_failed"\)/.test(candidate)],
    ["both null-only returning lineage transitions", nullCas === 2],
    ["work-order lineage failure truth", /if \(!linked\.rows\[0\]\) throw new Error\("triage_work_order_link_lost"\)/.test(candidate)],
    ["damage-report lineage failure truth", /if \(!linked\.rows\[0\]\) throw new Error\("triage_damage_report_link_lost"\)/.test(candidate)],
  ];
  return checks.filter(([, ok]) => !ok).map(([label]) => label);
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-maintenance-triage-conversions-atomic FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [/\{ config: \{ rateLimit: \{ max: 60, timeWindow: "1 minute" \} \} \},/, ""],
    [/LIMIT 1\s+FOR UPDATE/, "LIMIT 1"],
    [/if \(!workOrderId\) throw new Error\("triage_work_order_insert_failed"\);/, ""],
    [/if \(!damageReportId\) throw new Error\("triage_damage_report_insert_failed"\);/, ""],
    [/AND promoted_to_wo_id IS NULL/g, "AND TRUE"],
    [/if \(!linked\.rows\[0\]\) throw new Error\("triage_work_order_link_lost"\);/, ""],
    [/if \(!linked\.rows\[0\]\) throw new Error\("triage_damage_report_link_lost"\);/, ""],
  ];
  for (const [pattern, replacement] of mutations) {
    const changed = source.replace(pattern, replacement);
    if (changed === source || failures(changed).length === 0) {
      console.error(`verify-maintenance-triage-conversions-atomic selftest mutation escaped: ${pattern}`);
      process.exit(1);
    }
  }
  console.log(`verify-maintenance-triage-conversions-atomic --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-maintenance-triage-conversions-atomic PASS — both converters lock, create, and CAS-link atomically");
