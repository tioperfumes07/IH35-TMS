#!/usr/bin/env node
/**
 * DISP-F6470 — LINK-F5171 group (b): `dispatch.detention_events.load_id` has always existed, but
 * `LoadDetailDrawer` had no reverse section at all, alongside its 5 sibling reverse sections (work
 * orders, safety records, in-transit issues, driver reports, insurance claims).
 *
 * Deliberately NOT a reuse of the Detention Board's own `listDetentionBoard` query: that board is
 * the OPERATIONAL queue, scoped to `status IN ('accruing', 'closed')` -- a load whose detention
 * was successfully bridged to billing (status='billed', the completed outcome) would be silently
 * invisible on its own reverse section if it just filtered the board's list client-side. Same
 * principle as LOAD-WO-REVERSE (LoadWorkOrdersReverseSection.tsx's own comment): a load-scoped
 * reverse read shows the full history, not just the open-queue subset.
 *
 * This guard ratchets: the new dedicated load-scoped backend route+query (no status filter), the
 * frontend client function, the reverse section component, and its mount in LoadDetailDrawer.
 *
 * Self-test: node scripts/verify-load-detention-reverse-link.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-load-detention-reverse-link";
const F = {
  service: "apps/backend/src/dispatch/detention.service.ts",
  routes: "apps/backend/src/dispatch/detention.routes.ts",
  client: "apps/frontend/src/api/dispatch.ts",
  section: "apps/frontend/src/components/dispatch/LoadDetentionReverseSection.tsx",
  drawer: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
};

const CHECKS = [
  { name: "backend load-scoped query has no status filter (all outcomes, including billed)", file: F.service, pattern: /export async function listDetentionEventsForLoad\([\s\S]{0,900}WHERE de\.operating_company_id = \$1::uuid\s*\n\s*AND de\.load_id = \$2::uuid\s*\n\s*ORDER BY/ },
  { name: "backend load-scoped query binds the exact load id", file: F.service, pattern: /listDetentionEventsForLoad\(userId: string, operatingCompanyId: string, loadId: string\)/ },
  { name: "route validates load_id as a required uuid", file: F.routes, pattern: /const loadEventsQuerySchema = z\.object\(\{\s*\n\s*operating_company_id: z\.string\(\)\.uuid\(\),\s*\n\s*load_id: z\.string\(\)\.uuid\(\),/ },
  { name: "route is authenticated", file: F.routes, pattern: /"\/api\/v1\/dispatch\/detention\/events"[\s\S]{0,220}const user = authed\(req, reply\)/ },
  { name: "route is rate-limited", file: F.routes, pattern: /"\/api\/v1\/dispatch\/detention\/events"[\s\S]{0,180}rateLimit: \{ max: 60, timeWindow: "1 minute" \}/ },
  { name: "route delegates to the load-scoped service function", file: F.routes, pattern: /return listDetentionEventsForLoad\(user\.uuid, query\.data\.operating_company_id, query\.data\.load_id\)/ },
  { name: "client function calls the new load-scoped route", file: F.client, pattern: /export function getDetentionEventsForLoad\(operatingCompanyId: string, loadId: string\) \{\s*\n\s*return apiRequest<\{ events: DetentionBoardEvent\[\] \}>\(\s*\n\s*`\/api\/v1\/dispatch\/detention\/events\?/ },
  { name: "reverse section reuses the load-scoped client function (not the board's)", file: F.section, pattern: /getDetentionEventsForLoad\(operatingCompanyId, loadId\)/ },
  { name: "reverse section hides cached rows on failure", file: F.section, pattern: /const rows = query\.isError \? \[\] : \(query\.data \?\? \[\]\)/ },
  { name: "reverse section failure retries the exact query", file: F.section, pattern: /<ListErrorState[\s\S]{0,180}onRetry=\{\(\) => void query\.refetch\(\)\}/ },
  { name: "reverse section marker", file: F.section, pattern: /data-testid="load-reverse-detention"/ },
  { name: "load drawer imports the reverse section", file: F.drawer, pattern: /import \{ LoadDetentionReverseSection \}/ },
  { name: "load drawer mounts the reverse section bound to the exact load", file: F.drawer, pattern: /<LoadDetentionReverseSection\s+operatingCompanyId=\{load\.operating_company_id\}\s+loadId=\{load\.id\}/ },
];

const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (match) => " ".repeat(match.length));

function readSources() {
  return Object.fromEntries(Object.values(F).map((file) => [file, stripComments(fs.readFileSync(file, "utf8"))]));
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
    const planted = original.replace(check.pattern, "/* planted DISP-F6470 detention reverse defect */");
    if (planted === original || !collectFailures({ ...sources, [check.file]: planted }).includes(check.name)) inert.push(check.name);
  }
  if (inert.length) {
    console.error(`[${LABEL}] SELFTEST FAIL: inert plants: ${inert.join(", ")}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest PASS: rejected ${CHECKS.length}/${CHECKS.length} independent detention/load reverse plants`);
  process.exit(0);
}

const failures = collectFailures(sources);
if (failures.length) {
  console.error(`[${LABEL}] FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS: ${CHECKS.length} exact detention↔load reverse-link obligations ratcheted`);
