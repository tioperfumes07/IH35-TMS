#!/usr/bin/env node
import fs from "node:fs";

const serviceFile = "apps/backend/src/maintenance/service-timeline.service.ts";
const apiFile = "apps/frontend/src/api/maintenance.ts";
const componentFile = "apps/frontend/src/components/maintenance/ServiceTimeline.tsx";

function verify(service, api, component) {
  const errors = [];
  api = api.slice(api.indexOf("export function getMaintenanceServiceTimeline"), api.indexOf("export function attachMaintenanceInspectionPhoto"));
  const need = (source, pattern, message) => { if (!pattern.test(source)) errors.push(message); };
  need(service, /pageServiceTimeline[\s\S]*WITH timeline_unfiltered AS[\s\S]*UNION ALL/, "enabled event sources must be unioned before paging");
  need(service, /timeline AS \([\s\S]*occurred_at >= \$3::date[\s\S]*occurred_at < \$4::date \+ INTERVAL '1 day'/, "date filters must run inside the canonical union query");
  need(service, /totals AS \(SELECT COUNT\(\*\)::text AS total_count FROM timeline\)/, "timeline needs an exact post-filter total");
  need(service, /ORDER BY occurred_at DESC NULLS LAST, event_type, id LIMIT \$5 OFFSET \$6/, "global timeline needs deterministic bound paging");
  need(service, /LEFT JOIN page ON true/, "out-of-range and empty pages must retain the exact total");
  need(service, /pageServiceTimeline\(client,[\s\S]*offset: q\.offset/, "mounted route must call the exact range implementation");
  need(service, /total_count: page\.totalCount[\s\S]*limit: q\.limit[\s\S]*offset: q\.offset/, "mounted response must expose exact range metadata");
  need(api, /offset\?: number[\s\S]*if \(params\.offset != null\) q\.set\("offset", String\(params\.offset\)\);[\s\S]*total_count: number/, "typed client must send offset and retain total");
  need(component, /queryKey: \["service-timeline", companyId, unitId, equipmentId, selectedTypes, fromDate, toDate, page\]/, "query identity must include every scope/filter and page");
  need(component, /offset: page \* PAGE_SIZE/, "component must request the selected server range");
  need(component, /useEffect\(\(\) => setPage\(0\), \[companyId, unitId, equipmentId, selectedTypes, fromDate, toDate\]\)/, "scope/filter changes must reset range");
  need(component, /\{page \* PAGE_SIZE \+ 1\}–\{Math\.min\(\(page \+ 1\) \* PAGE_SIZE, totalCount\)\} of \{totalCount\}/, "profile surface must disclose exact range");
  need(component, /fleet:unit\.profile\.maintenance:\{unit,connectivity,reverse_link,qbo_chrome\}[\s\S]*fleet:trailer\.profile\.maintenance:\{trailer,connectivity,reverse_link,qbo_chrome\}/, "both mounted profile leaves need exact Built evidence");
  return errors;
}

const sources = [serviceFile, apiFile, componentFile].map((file) => fs.readFileSync(file, "utf8"));
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["union", sources[0].replace("WITH timeline_unfiltered AS", "WITH removed_union AS"), sources[1], sources[2]],
    ["date", sources[0].replace("occurred_at >= $3::date", "TRUE"), sources[1], sources[2]],
    ["count", sources[0].replace("COUNT(*)::text AS total_count FROM timeline", "COUNT(*)::text AS total_count FROM timeline_unfiltered"), sources[1], sources[2]],
    ["range", sources[0].replace("LIMIT $5 OFFSET $6", "LIMIT 200"), sources[1], sources[2]],
    ["empty-total", sources[0].replace("LEFT JOIN page ON true", "JOIN page ON true"), sources[1], sources[2]],
    ["response-total", sources[0].replace("total_count: page.totalCount", "total_count: page.events.length"), sources[1], sources[2]],
    ["api-offset", sources[0], sources[1].replaceAll("q.set(\"offset\", String(params.offset))", "q.set(\"offset\", \"0\")"), sources[2]],
    ["query-key", sources[0], sources[1], sources[2].replace(", page]", "]")],
    ["ui-offset", sources[0], sources[1], sources[2].replace("offset: page * PAGE_SIZE", "offset: 0")],
    ["ui-total", sources[0], sources[1], sources[2].replace(" of {totalCount}", "")],
    ["reset", sources[0], sources[1], sources[2].replace("useEffect(() => setPage(0), [companyId, unitId, equipmentId, selectedTypes, fromDate, toDate]);", "")],
    ["trailer-leaf", sources[0], sources[1], sources[2].replace("trailer,connectivity,reverse_link", "trailer,connectivity")],
  ];
  const survived = mutations.filter(([, ...args]) => verify(...args).length === 0).map(([name]) => name);
  if (survived.length) {
    console.error(`verify-maintenance-service-timeline-exact-range selftest FAIL: ${survived.join(", ")} survived`);
    process.exit(1);
  }
  console.log(`verify-maintenance-service-timeline-exact-range selftest PASS: ${mutations.length}/${mutations.length} rejected`);
  process.exit(0);
}
const errors = verify(...sources);
if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-maintenance-service-timeline-exact-range PASS");
