#!/usr/bin/env node
// Guard — geofence-timeline must not reintroduce the unused-positional-param bug. The query passed
// [loadId, operating_company_id, likePattern] but the SQL only referenced $2/$3 — loadId ($1) was
// never used (it is already baked into the $3 LIKE pattern), so Postgres couldn't type $1 and threw
// "could not determine data type of parameter $1" on GET /api/v1/dispatch/loads/:id/geofence-timeline.
//
// (A repo-wide "placeholders must be contiguous from $1" check was prototyped but produced false
// positives on legitimate query FRAGMENTS that are string-concatenated into a base query — static
// analysis can't reliably separate a complete query from an assembled one. So this guard is scoped to
// the file that actually broke, locking the regression precisely.)
import { readFileSync } from "node:fs";

const FILE = "apps/backend/src/dispatch/load-geofence-timeline.routes.ts";
const fail = (m) => { console.error(`FAIL verify-no-unused-query-params: ${m}`); process.exit(1); };
const src = readFileSync(FILE, "utf8");

// The buggy bind must be gone: loadId must NOT be passed as a leading param alongside the geofence
// LIKE pattern.
if (/\[\s*loadId\s*,\s*operating_company_id\s*,\s*`load-\$\{loadId\}-stop-%`/.test(src)) {
  fail(`${FILE}: geofence query passes an unused loadId ($1) param — bind only what the SQL references.`);
}
// The geofence query must reference $1 (operating_company_id) and $2 (LIKE), and bind exactly those two.
if (!/g\.operating_company_id = \$1[\s\S]{0,80}LIKE \$2/.test(src)) {
  fail(`${FILE}: geofence query must reference $1 (operating_company_id) + $2 (LIKE) contiguously from $1.`);
}
if (!/\[\s*operating_company_id\s*,\s*`load-\$\{loadId\}-stop-%`\s*\]/.test(src)) {
  fail(`${FILE}: geofence query must bind exactly [operating_company_id, \`load-\${loadId}-stop-%\`].`);
}

console.log("PASS verify-no-unused-query-params (geofence-timeline binds no unused positional param)");
