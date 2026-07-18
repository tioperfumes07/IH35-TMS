#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = "apps/backend/src/mdata/loads.routes.ts";
const TEST = "apps/backend/src/mdata/loads.routes.test.ts";
const LABEL = "verify-invoice-pickup-sort";

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
}

export function contractErrors(routeSource, testSource) {
  const errors = [];
  const listEndpointSource =
    routeSource.match(
      /app\.get\("\/api\/v1\/mdata\/loads",[\s\S]*?(?=\n\s*app\.get\("\/api\/v1\/mdata\/loads\/:id")/
    )?.[0] ?? "";
  const requireRoute = (pattern, message) => {
    if (!pattern.test(routeSource)) errors.push(`route: ${message}`);
  };
  const requireTest = (pattern, message) => {
    if (!pattern.test(testSource)) errors.push(`test: ${message}`);
  };

  requireRoute(
    /normalized === "pickup_date"[\s\S]{0,100}"pickup_date:asc"/,
    "pickup_date must normalize to ascending canonical sort"
  );
  requireRoute(
    /normalized === "-pickup_date"[\s\S]{0,100}"pickup_date:desc"/,
    "-pickup_date must normalize to descending canonical sort"
  );
  requireRoute(
    /pickup_date:\s*"sp\.scheduled_arrival_at"/,
    "pickup_date must map to the first pickup stop timestamp"
  );
  requireRoute(
    /sp\.scheduled_arrival_at \$\{sortDirection\} NULLS LAST, l\.created_at DESC, l\.id ASC|`\$\{sortColumn\} \$\{sortDirection\} NULLS LAST, l\.created_at DESC, l\.id ASC`/,
    "pickup ordering must be null-last with deterministic pagination tie-breakers"
  );
  requireRoute(
    /stop_type = 'pickup'[\s\S]{0,100}soft_deleted_at IS NULL[\s\S]{0,100}ORDER BY sequence_number ASC/,
    "canonical pickup lateral must ignore archived stops and choose the first sequence"
  );
  const deliveryLaterals = [...listEndpointSource.matchAll(/LEFT JOIN LATERAL \(([\s\S]*?)\) sd ON true/g)]
    .map((match) => match[1])
    .filter((lateral) => /stop_type = 'delivery'/.test(lateral));
  if (deliveryLaterals.length !== 2) {
    errors.push("route: count and list must each use the canonical delivery lateral");
  } else if (
    deliveryLaterals.some(
      (lateral) =>
        !/stop_type = 'delivery'[\s\S]{0,100}soft_deleted_at IS NULL[\s\S]{0,100}ORDER BY sequence_number DESC/.test(
          lateral
        )
    )
  ) {
    errors.push("route: count and list delivery laterals must both ignore archived stops");
  }
  requireRoute(
    /WHERE l\.operating_company_id = ANY\(\$1::uuid\[\]\)[\s\S]{0,100}\$\{whereClause\}/,
    "requested or resolved company scope must remain visibly bound in SQL"
  );

  requireTest(/sort:\s*"pickup_date"/, "ascending pickup behavior must be exercised");
  requireTest(/sort:\s*"-pickup_date"/, "descending pickup behavior must be exercised");
  requireTest(/NULLS LAST/, "null pickup timestamps must be asserted last");
  requireTest(/l\.operating_company_id = ANY\(\$1::uuid\[\]\)/, "entity isolation SQL must be asserted");
  requireTest(/totally_bogus[\s\S]{0,1200}ORDER BY l\.created_at DESC, l\.id ASC/, "invalid-sort fallback must be explicit");
  requireTest(
    /Archived Delivery[\s\S]{0,3000}First Active Delivery[\s\S]{0,3000}total_count:\s*2[\s\S]{0,500}has_more:\s*false/,
    "Fastify behavior must prove archived delivery exclusion preserves canonical city and pagination totals"
  );

  return errors;
}

function selftest() {
  const routeSource = read(ROUTE);
  const testSource = read(TEST);
  const baseline = contractErrors(routeSource, testSource);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAILED — current contract is not green`);
    for (const error of baseline) console.error(`  - ${error}`);
    process.exit(1);
  }

  const plantedRegressions = [
    ["remove descending alias", routeSource.replace('if (normalized === "-pickup_date")', 'if (normalized === "-removed")'), testSource],
    ["repoint canonical source", routeSource.replace('pickup_date: "sp.scheduled_arrival_at"', 'pickup_date: "l.created_at"'), testSource],
    ["remove null policy", routeSource.replace(" NULLS LAST, l.created_at DESC, l.id ASC", ", l.created_at DESC, l.id ASC"), testSource],
    [
      "remove delivery soft-delete filter",
      routeSource.replace(/(stop_type = 'delivery'\s+)AND soft_deleted_at IS NULL/, "$1"),
      testSource,
    ],
    ["remove entity assertion", routeSource, testSource.replace("l.operating_company_id = ANY($1::uuid[])", "scope removed")],
    ["remove invalid fallback assertion", routeSource, testSource.replace("totally_bogus", "valid_sort")],
  ];

  const missed = plantedRegressions.filter(([, routeFixture, testFixture]) =>
    contractErrors(routeFixture, testFixture).length === 0
  );
  if (missed.length) {
    console.error(`${LABEL} SELFTEST FAILED — planted regressions escaped`);
    for (const [name] of missed) console.error(`  - ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${plantedRegressions.length} planted regressions rejected`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = contractErrors(read(ROUTE), read(TEST));
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const vitest = path.join(ROOT, "node_modules", ".bin", "vitest");
if (!fs.existsSync(vitest)) {
  console.error(`${LABEL}: FAIL — CURRENT vitest runner is missing; run npm ci`);
  process.exit(1);
}
const result = spawnSync(
  vitest,
  ["run", "--config", "apps/backend/vitest.config.ts", TEST],
  { cwd: ROOT, stdio: "inherit" }
);
if (result.error || result.status !== 0) {
  console.error(`${LABEL}: FAIL — CURRENT Fastify behavioral suite failed`);
  if (result.error) console.error(result.error.message);
  process.exit(result.status ?? 1);
}

console.log(`${LABEL}: PASS — canonical pickup sort behavior and CURRENT runner are green`);
