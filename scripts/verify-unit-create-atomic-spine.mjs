#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const ROUTE = "apps/backend/src/mdata/units.routes.ts";
const ASSET = "apps/backend/src/mdata/ensure-unit-asset.shared.ts";

function inspect(route, asset) {
  const failures = [];
  const createStart = route.indexOf('app.post("/api/v1/mdata/units"');
  const create = route.slice(
    createStart,
    route.indexOf("\n  app.get(", createStart),
  );
  const checks = [
    [
      "unit list rate limit",
      route,
      /app\.get\(\s*"\/api\/v1\/mdata\/units",\s*\{ config: \{ rateLimit: \{ max: 60, timeWindow: "1 minute" \} \} \}/,
    ],
    [
      "quick availability rate limit",
      route,
      /app\.post\(\s*"\/api\/v1\/mdata\/units\/:id\/quick-availability",\s*\{ config: \{ rateLimit: \{ max: 60, timeWindow: "1 minute" \} \} \}/,
    ],
    [
      "atomic unit chain",
      create,
      /withCurrentUser\(authUser\.uuid, async \(client\) =>[\s\S]*INSERT INTO mdata\.units[\s\S]*ensureUnitAsset[\s\S]*appendCrudAudit[\s\S]*emitMasterDataCreatedSpineEvent/,
    ],
    [
      "driver company validation",
      create,
      /unit_create_dca[\s\S]*company_id = \$2::uuid[\s\S]*is_authorized = true[\s\S]*deactivated_at IS NULL/,
    ],
    [
      "driver fail loud",
      create,
      /if \(!driver\.rows\[0\]\?\.id\)\s*throw new Error\("invalid_assigned_driver_id"\)/,
    ],
    [
      "unit identity",
      create,
      /if \(!row\?\.id\) throw new Error\("unit_insert_returned_no_row"\)/,
    ],
    ["canonical default-driver edge", create, /syncCanonicalDefaultDriver\(client,[\s\S]*driverId: b\.assigned_driver_id[\s\S]*default_driver_assignment_id: defaultDriverAssignmentId/],
    [
      "asset audit link",
      create,
      /const assetId = await ensureUnitAsset[\s\S]*asset_id: assetId/,
    ],
    [
      "asset conditional relink",
      asset,
      /WHERE mdata\.assets\.unit_id IS NULL OR mdata\.assets\.unit_id = EXCLUDED\.unit_id/,
    ],
    [
      "asset identity",
      asset,
      /if \(!asset\?\.id \|\| asset\.unit_id !== input\.unitId\)\s*throw new Error\("unit_asset_identity_conflict"\)/,
    ],
  ];
  if (/client\.query\(["'`](?:BEGIN|COMMIT|ROLLBACK)["'`]\)/.test(create)) failures.push("unit create nested transaction control");
  for (const [label, source, pattern] of checks)
    if (!pattern.test(source)) failures.push(label);
  return failures;
}

const route = fs.readFileSync(ROUTE, "utf8");
const asset = fs.readFileSync(ASSET, "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    [route.replace('{ config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },', "{}"), asset],
    [route.replace(/(\/api\/v1\/mdata\/units\/:id\/quick-availability"[\s\S]*?)\{ config: \{ rateLimit: \{ max: 60, timeWindow: "1 minute" \} \} \}/, "$1{}"), asset],
    [route.replace("const created = await withCurrentUser", "const created = await noTransaction"), asset],
    [route.replace("unit_create_dca.is_authorized = true", "TRUE"), asset],
    [
      route.replace(
        /if \(!driver\.rows\[0\]\?\.id\)\s*throw new Error\("invalid_assigned_driver_id"\);/,
        "// planted",
      ),
      asset,
    ],
    [
      route.replace(
        'if (!row?.id) throw new Error("unit_insert_returned_no_row");',
        "// planted",
      ),
      asset,
    ],
    [route.replace("asset_id: assetId", "asset_id: null"), asset],
    [route.replace("driverId: b.assigned_driver_id", "driverId: null"), asset],
    [route.replace("// mdata.assets is FORCE-RLS", 'await client.query("COMMIT");\n          // mdata.assets is FORCE-RLS'), asset],
    [
      route,
      asset.replace(
        "mdata.assets.unit_id IS NULL OR mdata.assets.unit_id = EXCLUDED.unit_id",
        "TRUE",
      ),
    ],
    [
      route,
      asset.replace(
        /if \(!asset\?\.id \|\| asset\.unit_id !== input\.unitId\)\s*throw new Error\("unit_asset_identity_conflict"\);/,
        "// planted",
      ),
    ],
  ];
  const survived = mutations.filter(
    ([mutatedRoute, mutatedAsset]) =>
      inspect(mutatedRoute, mutatedAsset).length === 0,
  );
  if (survived.length) {
    console.error(
      `FAIL verify-unit-create-atomic-spine --selftest: ${survived.length}/${mutations.length} survived`,
    );
    process.exit(1);
  }
  console.log(
    `PASS verify-unit-create-atomic-spine --selftest (${mutations.length}/${mutations.length} mutations killed)`,
  );
  process.exit(0);
}

const failures = inspect(route, asset);
if (failures.length) {
  console.error(`FAIL verify-unit-create-atomic-spine: ${failures.join("; ")}`);
  process.exit(1);
}
console.log(
  "PASS verify-unit-create-atomic-spine — company driver → unit → insurance asset → audit/spine commits atomically",
);
