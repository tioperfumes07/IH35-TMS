import fs from "node:fs";

const service = fs.readFileSync("apps/backend/src/safety/integrity-alert-engine.service.ts", "utf8");
const cron = fs.readFileSync("apps/backend/src/safety/integrity-alert-engine.cron.ts", "utf8");

function ruleSlice(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to);
}

function problems(s = service, c = cron) {
  const fuel = ruleSlice(s, 'rule.rule_code === "fuel_anomaly"', 'rule.rule_code === "gps_spoof_pattern"');
  const gps = ruleSlice(s, 'rule.rule_code === "gps_spoof_pattern"', 'rule.rule_code === "odometer_cost_mismatch"');
  const wo = ruleSlice(s, 'rule.rule_code === "odometer_cost_mismatch"', 'rule.rule_code === "unbalanced_journal_entry"');
  const checks = [
    [[fuel, gps, wo].every((slice) => slice.length > 0), "three non-money rule families"],
    [[fuel, gps, wo].every((slice) => !slice.match(/LIMIT\s+200\b/)), "all silent scan caps removed"],
    [fuel.includes("operating_company_id = $1::uuid"), "fuel company scope"],
    [gps.includes("operating_company_id = $1::uuid") && gps.includes("minutes_over_avg >= $2"), "GPS company/threshold scope"],
    [wo.includes("operating_company_id = $1::uuid") && wo.includes("z_score >= $2"), "WO company/threshold scope"],
    [s.includes("for (const match of matches)") && s.includes("upsertEventAndAlert"), "complete matches reach idempotent writer"],
    [c.includes("runIntegrityAlertEngineForTenant(client, company.id)"), "cron invokes tenant engine"],
  ];
  return checks.filter(([ok]) => !ok).map(([, label]) => label);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [service.replace("FROM safety.v_fuel_mpg_anomalies\n        WHERE", "FROM safety.v_fuel_mpg_anomalies\n        LIMIT 200\n        WHERE"), cron],
    [service.replace("AND minutes_over_avg >= $2", "AND minutes_over_avg >= $2\n        LIMIT 200"), cron],
    [service.replace("AND z_score >= $2", "AND z_score >= $2\n        LIMIT 200"), cron],
    [service.replace("FROM safety.v_fuel_mpg_anomalies\n        WHERE operating_company_id = $1::uuid", "FROM safety.v_fuel_mpg_anomalies\n        WHERE TRUE"), cron],
    [service.replace("for (const match of matches)", "for (const match of matches.slice(0, 200))"), cron],
    [service, cron.replace("runIntegrityAlertEngineForTenant(client, company.id)", "Promise.resolve()")],
  ];
  const escaped = mutations.map((mutation, index) => problems(...mutation).length === 0 ? index + 1 : null).filter(Boolean);
  if (escaped.length) throw new Error(`${escaped.length} planted defect(s) escaped: ${escaped.join(",")}`);
  console.log(`verify-safety-integrity-engine-complete-nonmoney-scan selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const missing = problems();
if (missing.length) {
  console.error(`verify-safety-integrity-engine-complete-nonmoney-scan FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-safety-integrity-engine-complete-nonmoney-scan PASS — fuel/GPS/WO outlier rules scan every scoped match before idempotent alert upsert");
