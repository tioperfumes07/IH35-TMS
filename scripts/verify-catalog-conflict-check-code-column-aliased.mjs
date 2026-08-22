#!/usr/bin/env node
// verify-catalog-conflict-check-code-column-aliased (CLS-CATALOG-CODE-CONFLICT-COLUMN)
//
// BUG: generic-catalog.factory.ts's CREATE and PATCH handlers each run a pre-check to reject a
// duplicate `code`. Both queries hardcoded `WHERE code = $1` — but codeColumn-aliased catalogs
// (labor_rates -> rate_code, maintenance_part_locations -> location_code) have no physical `code`
// column at all, so the query itself 500s (Postgres 42703, "column \"code\" does not exist")
// before ever reaching the (correctly-aliased) INSERT/UPDATE. Live-reproduced clicking "+ Create"
// on Part Locations: POST /api/v1/catalogs/maintenance/part-locations -> 500, code 42703.
//
// FIX: both conflict-check queries must resolve the physical column via dbColumnForApiColumn("code",
// config) — the same helper every other column reference in this file already goes through — instead
// of a bare `code` literal.
//
// This guard is a static regex check on the CREATE/PATCH handler bodies: it fails if either
// conflict-check SQL string contains a literal `WHERE code = $1` (the un-aliased bug pattern) and
// passes only when both route through the codeDbColumn/dbColumnForApiColumn helper.
import { readFileSync } from "node:fs";

const FACTORY = "apps/backend/src/catalogs/generic-catalog.factory.ts";

function extractHandlerBodies(src) {
  // Isolate the two conflict-check call sites by anchoring on their SQL literal prefix.
  const conflictCallSites = [...src.matchAll(/SELECT id FROM catalogs\.\$\{config\.tableName\} WHERE ([^\s]+) = \$1/g)];
  return conflictCallSites.map((m) => m[1]);
}

function run(src) {
  const columns = extractHandlerBodies(src);
  if (columns.length < 2) {
    return { ok: false, reason: `expected 2 conflict-check SQL call sites (create + patch), found ${columns.length}` };
  }
  const bare = columns.filter((c) => c === "code");
  if (bare.length > 0) {
    return {
      ok: false,
      reason:
        `${bare.length} of ${columns.length} conflict-check quer${columns.length === 1 ? "y" : "ies"} in ${FACTORY} ` +
        `use a bare "code" literal instead of dbColumnForApiColumn("code", config) — this 500s (42703) on any ` +
        `codeColumn-aliased catalog (labor_rates, maintenance_part_locations) whenever the request body includes code.`,
    };
  }
  const aliased = columns.every((c) => /^\$\{codeDbColumn\}$/.test(c) || c.includes("codeDbColumn"));
  if (!aliased) {
    return { ok: false, reason: `unexpected conflict-check column reference(s): ${columns.join(", ")} — expected codeDbColumn` };
  }
  return { ok: true };
}

if (process.argv.includes("--selftest")) {
  const BAD = `
    const conflictSql = entityScoped
      ? \`SELECT id FROM catalogs.\${config.tableName} WHERE code = $1 AND operating_company_id = $2::uuid LIMIT 1\`
      : \`SELECT id FROM catalogs.\${config.tableName} WHERE code = $1 LIMIT 1\`;
    const conflict = await client.query(\`SELECT id FROM catalogs.\${config.tableName} WHERE code = $1 AND id <> $2 LIMIT 1\`, []);
  `;
  const GOOD = `
    const codeDbColumn = dbColumnForApiColumn("code", config);
    const conflictSql = entityScoped
      ? \`SELECT id FROM catalogs.\${config.tableName} WHERE \${codeDbColumn} = $1 AND operating_company_id = $2::uuid LIMIT 1\`
      : \`SELECT id FROM catalogs.\${config.tableName} WHERE \${codeDbColumn} = $1 LIMIT 1\`;
    const codeDbColumn2 = dbColumnForApiColumn("code", config);
    const conflict = await client.query(\`SELECT id FROM catalogs.\${config.tableName} WHERE \${codeDbColumn} = $1 AND id <> $2 LIMIT 1\`, []);
  `;
  const badResult = run(BAD);
  const goodResult = run(GOOD);
  if (badResult.ok) {
    console.error("verify-catalog-conflict-check-code-column-aliased --selftest FAIL: bad fixture incorrectly passed");
    process.exit(1);
  }
  if (!goodResult.ok) {
    console.error("verify-catalog-conflict-check-code-column-aliased --selftest FAIL: good fixture incorrectly failed:", goodResult.reason);
    process.exit(1);
  }
  console.log("verify-catalog-conflict-check-code-column-aliased --selftest OK");
  process.exit(0);
}

const src = readFileSync(FACTORY, "utf8");
const result = run(src);
if (!result.ok) {
  console.error(`verify-catalog-conflict-check-code-column-aliased: FAIL — ${result.reason}`);
  process.exit(1);
}
console.log("verify-catalog-conflict-check-code-column-aliased: OK — both create/patch conflict-check queries route through dbColumnForApiColumn(\"code\", config)");
