#!/usr/bin/env node
// F6 (Cascade finding, PR #21384, filed 2026-09-02): apps/backend/src/maintenance/dashboard.routes.ts's
// intransit-issues triage list query lacked i.operating_company_id = $1::uuid in its WHERE clause,
// while the row-count query directly above it already had it. The unit/driver JOINs only pin the
// UNIT and DRIVER to i.operating_company_id, never i.operating_company_id itself to $1 -- and this
// file's OWN comment on the neighboring load JOIN documents that RLS here allows any of a
// multi-entity user's companies, not just the one being viewed -- so without this filter a
// multi-entity user could see another entity's intransit_issues rows leak into the viewed entity's
// triage queue. Fixed by matching the count query exactly: WHERE i.operating_company_id = $1::uuid.
import fs from "node:fs";

const LABEL = "verify-maintenance-triage-queue-entity-scoped";
const FILE = "apps/backend/src/maintenance/dashboard.routes.ts";

export function checkTriageListEntityScoped(src) {
  const errors = [];
  // Isolate the list query (the SELECT that follows the count query and ends at its own closing
  // template literal) rather than matching anywhere in the file.
  const listMatch = src.match(/const res = await client\.query\(`[\s\S]*?FROM dispatch\.intransit_issues i[\s\S]*?`,\s*\[companyId/);
  if (!listMatch) {
    errors.push("could not locate the triage list query (const res = await client.query(...))");
    return errors;
  }
  const listQuery = listMatch[0];
  if (!/WHERE\s+i\.operating_company_id\s*=\s*\$1::uuid/.test(listQuery)) {
    errors.push("triage list query's WHERE clause no longer scopes i.operating_company_id = $1::uuid (cross-entity leak, matches F6)");
  }
  return errors;
}

function check(src) {
  const errors = checkTriageListEntityScoped(src);
  if (errors.length) throw new Error(errors.join("; "));
}

const src = fs.readFileSync(FILE, "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    src.replace(
      "        WHERE i.operating_company_id = $1::uuid\n          AND i.promoted_to_wo_id IS NULL",
      "        WHERE i.promoted_to_wo_id IS NULL"
    ),
  ];
  for (const mutated of mutations) {
    if (mutated === src) throw new Error("a mutation was a no-op (pattern did not match source)");
    try {
      check(mutated);
    } catch {
      caught += 1;
      continue;
    }
    throw new Error("a mutation escaped detection");
  }
  check(src);
  console.log(`${LABEL} SELFTEST PASS (${caught}/${mutations.length} planted defects caught)`);
} else {
  check(src);
  console.log(`${LABEL} PASS -- maintenance triage queue list query is entity-scoped, matching its own count query`);
}
