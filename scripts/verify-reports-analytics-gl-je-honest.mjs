#!/usr/bin/env node
/** Operational analytics and liquidity forecast leaves do not claim direct GL/JE linkage. */
import fs from "node:fs";
const LABEL = "verify-reports-analytics-gl-je-honest";
const requiredPath = "docs/specs/scoreboard/modules/reports.required.json";
const forbidden = ["report.per_truck_cpm", "report.customer_profitability", "report.profit_per_truck", "runner.cash_position"];
const mustKeep = ["report.trial_balance", "report.profit_loss", "report.balance_sheet", "audit.financial_change_log", "audit.void_reversal", "audit.period_close_history"];
function audit(doc, sources) {
  const failures = [];
  const leaves = new Map((doc.leaves || []).map((leaf) => [leaf.id, leaf]));
  for (const id of forbidden) {
    const leaf = leaves.get(id);
    if (!leaf) failures.push(`missing ${id}`);
    else if ((leaf.required || []).includes("gl_je")) failures.push(`${id} must not require gl_je`);
  }
  for (const id of mustKeep) {
    const leaf = leaves.get(id);
    if (!leaf) failures.push(`missing KEEP ${id}`);
    else if (!(leaf.required || []).includes("gl_je")) failures.push(`${id} must keep gl_je`);
  }
  for (const [name, source] of Object.entries(sources)) if (/accounting\.journal_entries|journal_entry_id|kind="journal_entry"/.test(source)) failures.push(`${name} gained direct JE semantics; re-scope and wire it`);
  return failures;
}
const doc = JSON.parse(fs.readFileSync(requiredPath, "utf8"));
const sources = {
  cpm: fs.readFileSync("apps/backend/src/reports/per-truck-cpm/cpm-calculator.service.ts", "utf8"),
  customer: fs.readFileSync("apps/backend/src/reports/customer-profitability.routes.ts", "utf8"),
  truck: fs.readFileSync("apps/backend/src/reports/profit-per-truck.routes.ts", "utf8"),
  cash: fs.readFileSync("apps/backend/src/reports/queries/cash-ar-daily.ts", "utf8"),
};
if (process.argv.includes("--selftest")) {
  const mutations = [...forbidden.map((id) => ["forbidden", id]), ...mustKeep.map((id) => ["keep", id])];
  for (const [kind, id] of mutations) {
    const candidate = structuredClone(doc);
    const leaf = candidate.leaves.find((item) => item.id === id);
    leaf.required = kind === "forbidden" ? [...new Set([...(leaf.required || []), "gl_je"])] : leaf.required.filter((c) => c !== "gl_je");
    if (audit(candidate, sources).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${kind}:${id}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(doc, sources);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — operational analytics drop gl_je while true GL statements/audits keep it`);
