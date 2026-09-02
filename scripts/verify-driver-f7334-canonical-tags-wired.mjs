#!/usr/bin/env node
/**
 * DRIVER-F7334-ROSTER-TAG-HAS-NO-CANONICAL-MODEL (docs/audit/GUARD-WORKORDERS.md, routed=CC-3).
 * Static, no-DB wiring check: schema (catalogs.driver_tags / mdata.driver_tag_memberships) ->
 * writer (bulk-tag route, append-only removal) -> reader (memberships resolver) -> filter (roster
 * client-side tag filter) -> audit (appendCrudAudit on create/bulk add/remove) -> reversal
 * (removed_at archives, never a real DELETE grant).
 *
 * Self-test: node scripts/verify-driver-f7334-canonical-tags-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-f7334-canonical-tags-wired";

const CHECKS = [
  {
    name: "routes: exports registerDriverTagsRoutes",
    file: "apps/backend/src/mdata/driver-tags.routes.ts",
    pattern: /export async function registerDriverTagsRoutes/,
  },
  {
    name: "routes: GET catalog list endpoint present",
    file: "apps/backend/src/mdata/driver-tags.routes.ts",
    pattern: /app\.get\("\/api\/v1\/mdata\/driver-tags"/,
  },
  {
    name: "routes: POST catalog create endpoint present",
    file: "apps/backend/src/mdata/driver-tags.routes.ts",
    pattern: /app\.post\("\/api\/v1\/mdata\/driver-tags"/,
  },
  {
    name: "routes: GET memberships resolver endpoint present",
    file: "apps/backend/src/mdata/driver-tags.routes.ts",
    pattern: /"\/api\/v1\/mdata\/driver-tags\/memberships"/,
  },
  {
    name: "routes: POST bulk-tag endpoint present",
    file: "apps/backend/src/mdata/driver-tags.routes.ts",
    pattern: /"\/api\/v1\/mdata\/drivers\/bulk-tag"/,
  },
  {
    name: "routes: cross-company driver ids are rejected, not silently dropped",
    file: "apps/backend/src/mdata/driver-tags.routes.ts",
    pattern: /driver_ids_not_found_for_company/,
  },
  {
    name: "routes: remove action archives via removed_at, never a real DELETE statement",
    file: "apps/backend/src/mdata/driver-tags.routes.ts",
    pattern: /SET removed_at = now\(\), removed_by_user_id/,
  },
  {
    name: "routes: tag creation is audited",
    file: "apps/backend/src/mdata/driver-tags.routes.ts",
    pattern: /appendCrudAudit\(client, user\.uuid, "mdata\.driver_tag\.created"/,
  },
  {
    name: "routes: bulk add/remove is audited",
    file: "apps/backend/src/mdata/driver-tags.routes.ts",
    pattern: /appendCrudAudit\(client, user\.uuid, `mdata\.driver_tag\.bulk_\$\{body\.data\.action\}`/,
  },
  {
    name: "index: registerDriverTagsRoutes is imported and called",
    file: "apps/backend/src/mdata/index.ts",
    pattern: /import \{ registerDriverTagsRoutes \} from "\.\/driver-tags\.routes\.js";[\s\S]*await registerDriverTagsRoutes\(app\)/,
  },
  {
    name: "frontend: driver-tags API client has all 4 functions",
    file: "apps/frontend/src/api/driver-tags.ts",
    pattern: /listDriverTags[\s\S]{0,2000}createDriverTag[\s\S]{0,2000}listDriverTagMemberships[\s\S]{0,2000}bulkTagDrivers/,
  },
  {
    name: "frontend: DriversTable Tag bulk-action button is enabled (not disabled/theater)",
    file: "apps/frontend/src/pages/drivers/DriversTable.tsx",
    pattern: /disabled=\{selected\.length === 0\}[\s\S]{0,300}Add or remove a tag on the selected drivers/,
  },
  {
    name: "frontend: DriversTable renders a Tags column from the memberships resolver",
    file: "apps/frontend/src/pages/drivers/DriversTable.tsx",
    pattern: /key: "tags"[\s\S]{0,200}membershipsByDriver\[row\.driverId\]/,
  },
  {
    name: "frontend: DriversTable has a tag filter wired into the staged filter bar",
    file: "apps/frontend/src/pages/drivers/DriversTable.tsx",
    pattern: /drivers-table-tag-filter/,
  },
  {
    name: "frontend: bulk tag modal calls bulkTagDrivers via useMutation",
    file: "apps/frontend/src/pages/drivers/DriversTable.tsx",
    pattern: /bulkTagMut = useMutation\(\{[\s\S]{0,300}bulkTagDrivers\(/,
  },
];

export function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src === null) {
      failures.push(`${c.name}: ${c.file} not found`);
      continue;
    }
    if (!c.pattern.test(src)) {
      failures.push(`${c.name}: ${c.file} no longer matches expected shape`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    "apps/backend/src/mdata/driver-tags.routes.ts": `
      export async function registerDriverTagsRoutes
      app.get("/api/v1/mdata/driver-tags"
      app.post("/api/v1/mdata/driver-tags"
      "/api/v1/mdata/driver-tags/memberships"
      "/api/v1/mdata/drivers/bulk-tag"
      driver_ids_not_found_for_company
      SET removed_at = now(), removed_by_user_id
      appendCrudAudit(client, user.uuid, "mdata.driver_tag.created", {
        resource_type: "catalogs.driver_tags",
      });
      appendCrudAudit(client, user.uuid, \`mdata.driver_tag.bulk_\${body.data.action}\`, {
        resource_type: "mdata.driver_tag_memberships",
      });
    `,
    "apps/backend/src/mdata/index.ts": `
      import { registerDriverTagsRoutes } from "./driver-tags.routes.js";
      await registerDriverTagsRoutes(app);
    `,
    "apps/frontend/src/api/driver-tags.ts": `
      export function listDriverTags ${"x".repeat(10)} export function createDriverTag ${"x".repeat(10)} export function listDriverTagMemberships ${"x".repeat(10)} export function bulkTagDrivers
    `,
    "apps/frontend/src/pages/drivers/DriversTable.tsx": `
      disabled={selected.length === 0}
      title="Add or remove a tag on the selected drivers"
      key: "tags",
      render: (row) => {
        const tags = membershipsByDriver[row.driverId] ?? [];
      drivers-table-tag-filter
      const bulkTagMut = useMutation({
        mutationFn: (input) => bulkTagDrivers(companyId, input.driverIds, input.tagId, input.action, input.reason),
      });
    `,
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length !== CHECKS.length) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should fail every check`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — DRIVER-F7334 canonical driver tags (schema/writer/reader/filter/audit/reversal) all wired`);
