#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const source = {
  route: fs.readFileSync("apps/backend/src/safety/integrity-alerts.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/safety.ts", "utf8"),
  page: fs.readFileSync("apps/frontend/src/pages/safety/IntegrityAlertsPage.tsx", "utf8"),
  reverse: fs.readFileSync("apps/frontend/src/components/safety/SafetyAlertsReverseSection.tsx", "utf8"),
};

function check(s) {
  const failures = [];
  const need = (ok, message) => { if (!ok) failures.push(message); };
  need(/listQuerySchema[\s\S]{0,600}limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(50\)[\s\S]{0,100}offset: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/.test(s.route), "integrity alerts must validate server range");
  need(/SELECT COUNT\(\*\)::text AS total_count[\s\S]{0,180}FROM safety\.integrity_alerts ia[\s\S]{0,120}WHERE \$\{filters\.join\(" AND "\)\}/.test(s.route), "integrity alerts must count the exact scoped filter graph");
  need(/LIMIT \$\$\{limitParameter\}[\s\S]{0,80}OFFSET \$\$\{offsetParameter\}/.test(s.route), "integrity alerts must use parameterized limit and offset");
  need((s.route.match(/total_count: result\.totalCount/g) ?? []).length === 2, "both integrity-alert list aliases must return exact totals");
  need((s.route.match(/app\.get\("\/api\/v1\/safety\/integrity-alerts(?:\/list)?", \{ config: \{ rateLimit: \{ max: 60, timeWindow: "1 minute" \} \} \}/g) ?? []).length === 2, "both integrity-alert list aliases must remain rate limited");
  need(/limit\?: number; offset\?: number/.test(s.api) && /integrity_alerts: Array<Record<string, unknown>>; total_count: number/.test(s.api), "integrity-alert API client must send and type range");
  need(/offset: \(page - 1\) \* pageSize/.test(s.page) && /data-testid="integrity-alerts-server-pager"/.test(s.page), "integrity inbox must navigate server pages");
  need(/pageSize=\{pageSize\}[\s\S]{0,100}\bhidePager\b/.test(s.page), "integrity inbox must suppress the local slice pager");
  need(/subject_vendor_id:[\s\S]{0,220}limit: alertPageSize,[\s\S]{0,80}offset: \(alertPage - 1\) \* alertPageSize/.test(s.reverse), "shared driver/unit/vendor reverse surface must request a server range");
  need(/safety-alerts-reverse-pager-\$\{subjectKind\}/.test(s.reverse) && /onRetry=\{\(\) => void Promise\.all/.test(s.reverse), "shared reverse surface must expose exact pager and retry");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...source, route: source.route.replace("max(200).default(50)", "max(500).default(500)") },
    { ...source, route: source.route.replace("SELECT COUNT(*)::text AS total_count", "SELECT 0::text AS hidden_count") },
    { ...source, route: source.route.replace("LIMIT $${limitParameter}", "LIMIT 500") },
    { ...source, route: source.route.replace("total_count: result.totalCount", "total_count: 0") },
    { ...source, route: source.route.replace('{ config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }', "") },
    { ...source, api: source.api.replaceAll("limit?: number; offset?: number", "") },
    { ...source, page: source.page.replace("offset: (page - 1) * pageSize", "offset: 0") },
    { ...source, page: source.page.replace('data-testid="integrity-alerts-server-pager"', 'data-testid="removed-pager"') },
    { ...source, page: source.page.replace("hidePager", "showPager") },
    { ...source, reverse: source.reverse.replace("offset: (alertPage - 1) * alertPageSize", "offset: 0") },
    { ...source, reverse: source.reverse.replace("onRetry={() => void Promise.all", "onRetry={() => void Promise.resolve") },
  ];
  const escaped = mutations.map((mutation, index) => ({ index, failures: check(mutation) })).filter(({ failures }) => failures.length === 0);
  if (escaped.length) { console.error(`FAIL(selftest): escaped mutations ${escaped.map(({ index }) => index + 1).join(", ")}`); process.exit(1); }
  console.log(`PASS(selftest): ${mutations.length}/${mutations.length} integrity-alert range mutations detected`);
  process.exit(0);
}

const failures = check(source);
if (failures.length) { failures.forEach((failure) => console.error(`FAIL: ${failure}`)); process.exit(1); }
console.log("PASS: integrity-alert inbox and driver/unit/vendor reverse surfaces expose the complete scoped range");
