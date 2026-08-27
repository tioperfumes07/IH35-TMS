#!/usr/bin/env node
import fs from "node:fs";

const paths = [
  "apps/backend/src/maintenance/tires.routes.ts",
  "apps/frontend/src/api/maintenance.ts",
  "apps/frontend/src/pages/maintenance/TireProgramPage.tsx",
];
const sources = paths.map((path) => fs.readFileSync(path, "utf8"));

function verify(routes, api, page) {
  const errors = [];
  const need = (source, pattern, message) => { if (!pattern.test(source)) errors.push(message); };
  const start = routes.indexOf('app.get("/api/v1/maintenance/tires/events"');
  const end = routes.indexOf('app.post("/api/v1/maintenance/tires/rotate"');
  const route = routes.slice(start, end);
  need(routes, /tire_record_id:[\s\S]*limit: z\.coerce\.number\(\).*max\(200\)\.default\(50\)[\s\S]*offset: z\.coerce\.number\(\).*default\(0\)/, "event reader must validate a bounded range");
  need(route, /SELECT COUNT\(\*\)::int AS total_count[\s\S]*WHERE \$\{filters\.join\(" AND "\)\}/, "event reader needs an exact identically-filtered count");
  need(route, /tr\.operating_company_id = te\.operating_company_id/g, "event-to-record join must retain company ownership");
  need(route, /ORDER BY te\.created_at DESC, te\.id DESC[\s\S]*LIMIT \$\$\{values\.length \+ 1\} OFFSET \$\$\{values\.length \+ 2\}/, "event reader needs deterministic bound paging");
  if (/LIMIT 200/.test(route)) errors.push("silent 200 cap must stay removed");
  need(api, /tire_record_id\?: string; limit\?: number; offset\?: number/, "typed client must carry range");
  need(api, /q\.set\("limit", String\(params\.limit \?\? 50\)\)[\s\S]*q\.set\("offset", String\(params\.offset \?\? 0\)\)[\s\S]*total_count: number/, "typed client must send range and retain exact total");
  need(page, /queryKey: \["maintenance", "tire-events", companyId, assetKind, assetId, eventPage\]/, "query identity must include asset scope and page");
  need(page, /limit: EVENT_PAGE_SIZE, offset: eventPage \* EVENT_PAGE_SIZE/, "mounted history must request its exact server page");
  need(page, /maintenance-tire-event-pager[\s\S]*Previous[\s\S]*Next/, "mounted history needs one controlled exact pager");
  need(page, /setEventPage\(0\)[\s\S]*\}, \[companyId, assetKind, assetId\]\)/, "paging must reset across company and asset transitions");
  need(page, /rotateMaintenanceTire[\s\S]*replaceMaintenanceTire[\s\S]*auditMaintenanceTireTread/, "canonical rotation/replacement/tread lifecycle must remain mounted");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [sources[0].replace("max(200).default(50)", "max(200).default(200)"), sources[1], sources[2]],
    [sources[0].replace("COUNT(*)::int AS total_count", "COUNT(*) AS removed"), sources[1], sources[2]],
    [sources[0].replaceAll("AND tr.operating_company_id = te.operating_company_id", ""), sources[1], sources[2]],
    [sources[0].replace("ORDER BY te.created_at DESC, te.id DESC", "ORDER BY te.created_at DESC"), sources[1], sources[2]],
    [sources[0].replace("LIMIT $${values.length + 1} OFFSET $${values.length + 2}", "LIMIT 200"), sources[1], sources[2]],
    [sources[0], sources[1].replaceAll("limit?: number", "removedLimit?: number"), sources[2]],
    [sources[0], sources[1].replace('q.set("offset", String(params.offset ?? 0));', ""), sources[2]],
    [sources[0], sources[1], sources[2].replace(", eventPage]", "]")],
    [sources[0], sources[1], sources[2].replace("offset: eventPage * EVENT_PAGE_SIZE", "offset: 0")],
    [sources[0], sources[1], sources[2].replace("maintenance-tire-event-pager", "removed")],
    [sources[0], sources[1], sources[2].replace("setEventPage(0);", "")],
    [sources[0], sources[1], sources[2].replaceAll("rotateMaintenanceTire", "removedRotate")],
  ];
  const survived = mutations.map((args, index) => verify(...args).length === 0 ? index + 1 : null).filter(Boolean);
  if (survived.length) { console.error(`selftest FAIL: ${survived.join(",")} survived`); process.exit(1); }
  console.log(`verify-maintenance-tire-event-history-exact-range selftest PASS: ${mutations.length}/${mutations.length} rejected`);
  process.exit(0);
}
const errors = verify(...sources);
if (errors.length) { console.error(errors.map((error) => `- ${error}`).join("\n")); process.exit(1); }
console.log("verify-maintenance-tire-event-history-exact-range PASS");
