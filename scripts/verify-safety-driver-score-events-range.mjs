#!/usr/bin/env node
// @matrix-built {"modules":["safety"],"cols":["driver","unit","connectivity","reverse_link"],"leaves":["driver_scoring.list"],"task":"SAFETY-F6860-DRIVER-SCORE-EVENTS-RANGE"}
import fs from "node:fs";
import process from "node:process";

const source = {
  route: fs.readFileSync("apps/backend/src/safety/driver-scoring.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/safety.ts", "utf8"),
  detail: fs.readFileSync("apps/frontend/src/pages/safety/driver-scoring/DriverScoreDetail.tsx", "utf8"),
};

function failures(s) {
  const result = [];
  const need = (ok, message) => { if (!ok) result.push(message); };
  need(/eventListQuerySchema[\s\S]{0,250}limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(50\)[\s\S]{0,100}offset: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/.test(s.route), "event route must validate range");
  need(/SELECT COUNT\(\*\)::int AS total_count[\s\S]{0,300}FROM safety\.harsh_events e[\s\S]{0,350}e\.driver_id = \$2::uuid/.test(s.route), "event route must count the exact company/driver/period graph");
  need(/LIMIT \$4[\s\S]{0,60}OFFSET \$5/.test(s.route) && /total_count: result\.totalCount/.test(s.route), "event route must return parameterized page and total");
  need(/range: \{ limit\?: number; offset\?: number \}/.test(s.api) && /events: DriverScoreEvent\[\]; total_count: number/.test(s.api), "event client must type range and total");
  need(/offset: \(eventPage - 1\) \* eventPageSize/.test(s.detail), "detail must request the selected event page");
  need(/data-testid="driver-score-events-server-pager"/.test(s.detail) && !/events \?\? \[\]\)\.slice\(0, 50\)/.test(s.detail), "detail must navigate the complete event range without client truncation");
  need(/setEventPage\(1\); setExpandedEventId\(null\)/.test(s.detail), "driver/period lifecycle must reset range and expanded event");
  need(/Couldn't load harsh events[\s\S]{0,220}eventsQuery\.refetch\(\)/.test(s.detail), "event failure must remain retryable");
  return result;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...source, route: source.route.replace("max(200).default(50)", "max(1000).default(1000)") },
    { ...source, route: source.route.replace("SELECT COUNT(*)::int AS total_count", "SELECT 0::int AS hidden_count") },
    { ...source, route: source.route.replace("LIMIT $4", "LIMIT 1000") },
    { ...source, route: source.route.replace("total_count: result.totalCount", "total_count: 0") },
    { ...source, api: source.api.replaceAll("range: { limit?: number; offset?: number }", "range: Record<string, never>") },
    { ...source, detail: source.detail.replace("offset: (eventPage - 1) * eventPageSize", "offset: 0") },
    { ...source, detail: source.detail.replace('data-testid="driver-score-events-server-pager"', 'data-testid="removed-pager"') },
    { ...source, detail: source.detail.replace("(eventsQuery.data?.events ?? []).map", "(eventsQuery.data?.events ?? []).slice(0, 50).map") },
    { ...source, detail: source.detail.replace("setEventPage(1); setExpandedEventId(null)", "setExpandedEventId(null)") },
    { ...source, detail: source.detail.replace("eventsQuery.refetch()", "Promise.resolve()") },
  ];
  const escaped = mutations.map((mutation, index) => failures(mutation).length ? null : index + 1).filter(Boolean);
  if (escaped.length) { console.error(`FAIL(selftest): escaped mutations ${escaped.join(", ")}`); process.exit(1); }
  console.log(`PASS(selftest): ${mutations.length}/${mutations.length} driver-score event range mutations detected`);
  process.exit(0);
}

const missing = failures(source);
if (missing.length) { missing.forEach((item) => console.error(`FAIL: ${item}`)); process.exit(1); }
console.log("PASS: driver scoring exposes the complete scoped harsh-event range with retry and lifecycle reset");
