#!/usr/bin/env node
/**
 * DISP-F5797 — load↔safety-event reverse chain.
 * The selected company/load drives the server-filtered read, and each returned
 * safety event/driver/unit drills through its exact FK and human label.
 *
 * Self-test: node scripts/verify-load-safety-reverse-includes-events.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-load-safety-reverse-includes-events";
const F = {
  section: "apps/frontend/src/components/safety/LoadSafetyReverseSection.tsx",
  client: "apps/frontend/src/api/safety.ts",
  route: "apps/backend/src/safety/events/safety-events.routes.ts",
};

const CHECKS = [
  { name: "load safety query key binds company and load", file: F.section, pattern: /queryKey: \["safety", "reverse", "events-log", "load", companyId, loadId\]/ },
  { name: "load safety read binds company and related-load FK", file: F.section, pattern: /listSafetyEventLog\(companyId, \{ related_load_id: loadId \}\)/ },
  { name: "load safety read disabled without both identities", file: F.section, pattern: /listSafetyEventLog\(companyId, \{ related_load_id: loadId \}\),\s+enabled: Boolean\(companyId\) && Boolean\(loadId\)/ },
  { name: "load safety reverse section marker", file: F.section, pattern: /data-testid="load-safety-reverse-safety-events"/ },
  { name: "full safety-event list opens scoped to exact load", file: F.section, pattern: /kind="safety_events_load"\s+id=\{loadId\}\s+label="Open Safety Events"/ },
  { name: "safety-event row preserves exact identity", file: F.section, pattern: /rows\.map\(\(row\) => \([\s\S]{0,180}key=\{row\.id\}[\s\S]{0,220}kind="safety_event"\s+id=\{row\.id\}\s+label=\{entityLabel\(row\.title \|\| null, row\.id, "Safety event"\)\}/ },
  { name: "safety-event driver drill binds exact FK and label", file: F.section, pattern: /kind="driver"\s+id=\{s\(row\.subject_driver_id\)\}\s+label=\{entityLabel\(\s*row\.subject_driver_name,\s*row\.subject_driver_id,\s*"Driver"/ },
  { name: "safety-event unit drill binds exact FK and label", file: F.section, pattern: /kind="unit"\s+id=\{s\(row\.subject_unit_id\)\}\s+label=\{entityLabel\(\s*row\.subject_unit_number,\s*row\.subject_unit_id,\s*"Unit"/ },
  { name: "client accepts related-load FK", file: F.client, pattern: /export function listSafetyEventLog\([\s\S]{0,380}related_load_id\?: string/ },
  { name: "client sends selected company", file: F.client, pattern: /export function listSafetyEventLog\([\s\S]{0,650}new URLSearchParams\(\{ operating_company_id: companyId \}\)/ },
  { name: "client sends related-load FK", file: F.client, pattern: /export function listSafetyEventLog\([\s\S]{0,900}if \(params\.related_load_id\) qs\.set\("related_load_id", params\.related_load_id\)/ },
  { name: "route validates related-load UUID", file: F.route, pattern: /const listQuerySchema = companyQuerySchema\.extend\(\{[\s\S]{0,500}related_load_id: z\.string\(\)\.uuid\(\)\.optional\(\)/ },
  { name: "route starts with selected-company filter", file: F.route, pattern: /const values: unknown\[\] = \[query\.data\.operating_company_id\];\s+const filters = \["e\.operating_company_id = \$1::uuid"\]/ },
  { name: "route applies exact related-load filter", file: F.route, pattern: /if \(query\.data\.related_load_id\) \{\s+values\.push\(query\.data\.related_load_id\);\s+filters\.push\(`e\.related_load_id = \$\$\{values\.length\}::uuid`\);\s+\}/ },
  { name: "load human-label join is same-company", file: F.route, pattern: /app\.get\("\/api\/v1\/safety\/events-log"[\s\S]{0,6500}LEFT JOIN mdata\.loads l\s+ON l\.id = e\.related_load_id\s+AND l\.operating_company_id = e\.operating_company_id/ },
];

function readSources() {
  return Object.fromEntries(Object.values(F).map((file) => [file, fs.readFileSync(file, "utf8")]));
}

export function collectFailures(sources) {
  return CHECKS.filter(({ file, pattern }) => !pattern.test(sources[file])).map(({ name }) => name);
}

const sources = readSources();
if (process.argv.includes("--selftest")) {
  const baseline = collectFailures(sources);
  if (baseline.length) {
    console.error(`[${LABEL}] SELFTEST baseline FAIL:\n- ${baseline.join("\n- ")}`);
    process.exit(1);
  }
  const inert = [];
  for (const check of CHECKS) {
    const original = sources[check.file];
    const planted = original.replace(check.pattern, "/* planted DISP-F5797 load-safety reverse defect */");
    if (planted === original || !collectFailures({ ...sources, [check.file]: planted }).includes(check.name)) inert.push(check.name);
  }
  if (inert.length) {
    console.error(`[${LABEL}] SELFTEST FAIL: inert plants: ${inert.join(", ")}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest PASS: rejected ${CHECKS.length}/${CHECKS.length} independent load-safety reverse plants`);
  process.exit(0);
}

const failures = collectFailures(sources);
if (failures.length) {
  console.error(`[${LABEL}] FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS: ${CHECKS.length} exact load-safety reverse obligations ratcheted`);
