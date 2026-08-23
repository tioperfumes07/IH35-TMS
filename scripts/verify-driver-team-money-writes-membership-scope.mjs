#!/usr/bin/env node
/**
 * GUARD: every money-bearing driver-team WRITE (create/update-split/deactivate/assign-to-load/
 * compute-split) must prove company membership before setting the RLS scope GUC to a
 * caller-supplied operating_company_id, and a membership failure must surface as an honest 403
 * everywhere the write is reachable.
 *
 * DRV-F6002. `apps/backend/src/mdata/driver-team.service.ts`'s five money-bearing entry points
 * (createTeam, updateTeamSplit, deactivateTeam, assignTeamToLoad, computeTeamLoadSplit) installed
 * `input.operating_company_id` directly via `SELECT set_config('app.operating_company_id', ...)`
 * with no proof the authenticated user belongs to that company — the caller-controlled GUC was the
 * RLS scope, not an authorization decision. DRV-F6001 already fixed this exact defect class for the
 * sibling READ entry points (listDriverTeams/getDriverTeam) via `setScopedCompanyContext`; this
 * guard proves the five money-bearing WRITE siblings got the same fix.
 *
 * Also checks the 403 mapping: `setScopedCompanyContext` throws `Error("forbidden_company_membership")`
 * (statusCode 403 attached) — a route whose catch block doesn't recognize that message surfaces a
 * real authorization failure as a generic 500/400 instead of 403. Both call sites
 * (driver-team-split.routes.ts's shared mapServiceError, and driver-teams-alias.routes.ts's own
 * inline DELETE mapping) are checked.
 *
 * Run:  node scripts/verify-driver-team-money-writes-membership-scope.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-team-money-writes-membership-scope";

const FILES = {
  service: "apps/backend/src/mdata/driver-team.service.ts",
  routes: "apps/backend/src/mdata/driver-team-split.routes.ts",
  alias: "apps/backend/src/mdata/driver-teams-alias.routes.ts",
};

function read(files) {
  return Object.fromEntries(
    Object.entries(files).map(([key, rel]) => [key, fs.readFileSync(path.join(root, rel), "utf8")])
  );
}

const WRITE_CALL = "setScopedCompanyContext(client, userId, input.operating_company_id)";

export function failures(s) {
  const out = [];
  const writeCount = (s.service.match(/setScopedCompanyContext\(client, userId, input\.operating_company_id\)/g) ?? []).length;
  if (writeCount !== 5) {
    out.push(
      `expected exactly 5 money-write call sites using setScopedCompanyContext(...input.operating_company_id) ` +
        `(createTeam/updateTeamSplit/deactivateTeam/assignTeamToLoad/computeTeamLoadSplit), found ${writeCount}`
    );
  }
  // A raw, unscoped set_config on input.operating_company_id anywhere means a write site regressed
  // back to the caller-controlled-GUC shape DRV-F6002 fixed.
  if (/SELECT set_config\('app\.operating_company_id', \$1::text, true\)`, \[input\.operating_company_id\]/.test(s.service)) {
    out.push("a money-write site still installs input.operating_company_id via raw set_config (unscoped)");
  }
  if (!/forbidden_company_membership.*?403|403.*?forbidden_company_membership/s.test(s.routes.replace(/\s+/g, " "))) {
    out.push("driver-team-split.routes.ts's mapServiceError does not map forbidden_company_membership to 403");
  }
  if (!/forbidden_company_membership.*?403|403.*?forbidden_company_membership/s.test(s.alias.replace(/\s+/g, " "))) {
    out.push("driver-teams-alias.routes.ts's DELETE catch does not map forbidden_company_membership to 403");
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const base = read(FILES);
  const fails = [];

  if (failures(base).length !== 0) fails.push(`real tree is not clean: ${failures(base).join("; ")}`);

  const oneRegressed = {
    ...base,
    service: base.service.replace(WRITE_CALL, `client.query(\`SELECT set_config('app.operating_company_id', $1::text, true)\`, [input.operating_company_id]`),
  };
  if (!failures(oneRegressed).some((f) => f.includes("found 4") || f.includes("still installs"))) {
    fails.push("regressing ONE write site back to raw set_config was not caught");
  }

  const allRegressed = { ...base, service: base.service.split(WRITE_CALL).join("client.query('SELECT 1')") };
  if (!failures(allRegressed).some((f) => f.includes("found 0"))) fails.push("regressing ALL write sites was not caught");

  const noRoutesMapping = { ...base, routes: base.routes.replace(/forbidden_company_membership/g, "gone") };
  if (!failures(noRoutesMapping).some((f) => f.includes("driver-team-split.routes.ts"))) {
    fails.push("removing the routes.ts 403 mapping was not caught");
  }

  const noAliasMapping = { ...base, alias: base.alias.replace(/forbidden_company_membership/g, "gone") };
  if (!failures(noAliasMapping).some((f) => f.includes("driver-teams-alias.routes.ts"))) {
    fails.push("removing the alias.ts 403 mapping was not caught");
  }

  if (fails.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of fails) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 5/5 (real tree clean, single regression caught, full regression caught, ` +
      `routes.ts 403-mapping regression caught, alias.ts 403-mapping regression caught)`
  );
  process.exit(0);
}

const problems = failures(read(FILES));
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — all 5 driver-team money-write entry points are membership-scoped, both 403 mappings present.`);
