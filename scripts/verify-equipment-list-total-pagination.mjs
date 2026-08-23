#!/usr/bin/env node
// 0091-g9-h6 regression guard (trailer / equipment list follow-up).
//
// GET /api/v1/mdata/equipment paged with LIMIT/OFFSET but returned only `{ equipment }` — no total,
// no has_more, no echoed limit/offset. A UI capped at limit=50 then cannot size a pager, so trailers
// past the first page are unreachable. This guard fails if the list handler stops returning a real
// COUNT(*) total over the same filtered/scoped set, a has_more flag, and limit/offset echoes.
//
// Schema landmine: mdata.equipment has NO operating_company_id column. Entity scope MUST stay on
// owner_company_id / currently_leased_to_company_id. Inventing equipment.operating_company_id is a
// fail.
//
// Wired into verify:pre-commit via scripts/verify-steps/117-verify-equipment-list-total-pagination.mjs.
// Self-test: node scripts/verify-equipment-list-total-pagination.mjs --selftest
// LINKAGE: N/A (enforcement infra). Additive only. No package.json / CI hot-file edits (Rule 17).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/mdata/equipment.routes.ts";
const API_TARGET = "apps/frontend/src/api/mdata.ts";

export function check(src, apiSrc) {
  const failures = [];

  // Isolate the GET list handler (not GET-by-id / status-change / deactivate).
  const listRoute = /app\.get\(\s*"\/api\/v1\/mdata\/equipment"/g;
  const listStart = listRoute.exec(src)?.index ?? -1;
  if (listStart < 0) {
    failures.push('GET /api/v1/mdata/equipment list handler missing');
    return failures;
  }
  const listEnd = src.indexOf('app.post("/api/v1/mdata/equipment"', listStart);
  const listSrc = listEnd > listStart ? src.slice(listStart, listEnd) : src.slice(listStart);

  const schemaStart = src.indexOf("const listQuerySchema = z.object({");
  const schemaEnd = src.indexOf("const idParamSchema", schemaStart);
  const schemaSrc = schemaStart >= 0 && schemaEnd > schemaStart ? src.slice(schemaStart, schemaEnd) : "";
  if (!/operating_company_id:\s*z\.string\(\)\.uuid\(\)\s*,/.test(schemaSrc)) {
    failures.push("GET /mdata/equipment must require the selected operating_company_id");
  }
  if (
    !/export type ListEquipmentParams\s*=\s*\{[\s\S]*?operating_company_id:\s*string;/.test(apiSrc) ||
    !/listEquipment\([\s\S]*?qs\.set\("operating_company_id",\s*params\.operating_company_id\)/.test(apiSrc)
  ) {
    failures.push("listEquipment must require and serialize the selected operating company");
  }

  if (!/count\(\*\)\s*::int\s+AS\s+total\s+FROM\s+mdata\.equipment/i.test(listSrc)) {
    failures.push(
      "GET /mdata/equipment must run count(*)::int AS total over mdata.equipment to size the pager",
    );
  }
  if (!/has_more\s*:/.test(listSrc)) {
    failures.push("GET /mdata/equipment response must include a `has_more` flag");
  }
  if (!/\btotal\s*:/.test(listSrc)) {
    failures.push("GET /mdata/equipment response must include a `total` count");
  }
  if (!/\blimit\s*,/.test(listSrc) && !/\blimit\s*:/.test(listSrc)) {
    failures.push("GET /mdata/equipment response must echo `limit`");
  }
  if (!/\boffset\s*,/.test(listSrc) && !/\boffset\s*:/.test(listSrc)) {
    failures.push("GET /mdata/equipment response must echo `offset`");
  }
  if (!/ORDER BY\s+created_at\s+DESC\s*,\s*id\s+ASC/i.test(listSrc)) {
    failures.push(
      "GET /mdata/equipment must ORDER BY created_at DESC, id ASC (deterministic tie-breaker)",
    );
  }
  // Both count + item SQL template literals must carry the entity scope as SOURCE TEXT so
  // verify-mdata-entity-scope can see it (dynamic filters.push of the predicate is not enough).
  const countLit =
    listSrc.match(
      /`[\s\S]*?count\(\*\)\s*::int\s+AS\s+total[\s\S]*?FROM\s+mdata\.equipment[\s\S]*?`/i
    )?.[0] ?? "";
  const itemLit =
    listSrc.match(
      /`[\s\S]*?FROM\s+mdata\.equipment[\s\S]*?ORDER BY\s+created_at\s+DESC\s*,\s*id\s+ASC[\s\S]*?`/i
    )?.[0] ?? "";
  const scopePred =
    /owner_company_id\s*=\s*\$1\s+OR\s+currently_leased_to_company_id\s*=\s*\$1/i;
  if (!countLit || !scopePred.test(countLit)) {
    failures.push(
      "GET /mdata/equipment COUNT SQL literal must contain static (owner_company_id = $1 OR currently_leased_to_company_id = $1)",
    );
  }
  if (!itemLit || !scopePred.test(itemLit)) {
    failures.push(
      "GET /mdata/equipment item SQL literal must contain static (owner_company_id = $1 OR currently_leased_to_company_id = $1)",
    );
  }
  // Fail closed on inventing a phantom column on this table.
  if (/mdata\.equipment[\s\S]{0,800}operating_company_id\s*=/.test(listSrc)) {
    failures.push(
      "GET /mdata/equipment must NOT filter on equipment.operating_company_id (column does not exist)",
    );
  }

  return failures;
}

export function run() {
  const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  const apiSrc = fs.readFileSync(path.join(ROOT, API_TARGET), "utf8");
  return check(src, apiSrc);
}

if (process.argv.includes("--selftest")) {
  const good = `
    const listQuerySchema = z.object({ operating_company_id: z.string().uuid(), });
    const idParamSchema = z.object({ id: z.string().uuid() });
    app.get(
      "/api/v1/mdata/equipment",
      async (req, reply) => {
      const countRes = await client.query(\`SELECT count(*)::int AS total
         FROM mdata.equipment
         WHERE (owner_company_id = $1 OR currently_leased_to_company_id = $1)\${optionalAnd}\`);
      const res = await client.query(\`SELECT id
          FROM mdata.equipment
          WHERE (owner_company_id = $1 OR currently_leased_to_company_id = $1)\${optionalAnd}
          ORDER BY created_at DESC, id ASC
          LIMIT $\${values.length - 1}
          OFFSET $\${values.length}\`);
      return { equipment: result.rows, total: result.total, limit, offset, has_more: offset + result.rows.length < result.total };
    });
    app.post("/api/v1/mdata/equipment", async () => {});
  `;
  const goodApi = `
    export type ListEquipmentParams = { operating_company_id: string; };
    export function listEquipment(params: ListEquipmentParams) {
      const qs = new URLSearchParams();
      qs.set("operating_company_id", params.operating_company_id);
    }
  `;
  const badBare = `
    app.get("/api/v1/mdata/equipment", async () => {
      const res = await client.query(\`SELECT * FROM mdata.equipment ORDER BY created_at DESC LIMIT $1 OFFSET $2\`);
      return { equipment: res.rows };
    });
    app.post("/api/v1/mdata/equipment", async () => {});
  `;
  const badDynamicOnly = `
    app.get("/api/v1/mdata/equipment", async () => {
      filters.push("(owner_company_id = $1 OR currently_leased_to_company_id = $1)");
      const countRes = await client.query(\`SELECT count(*)::int AS total FROM mdata.equipment \${whereClause}\`);
      const res = await client.query(\`SELECT id FROM mdata.equipment \${whereClause} ORDER BY created_at DESC, id ASC\`);
      return { equipment: [], total: 0, limit, offset, has_more: false };
    });
    app.post("/api/v1/mdata/equipment", async () => {});
  `;
  const badPhantomCol = `
    app.get("/api/v1/mdata/equipment", async () => {
      const countRes = await client.query(\`SELECT count(*)::int AS total FROM mdata.equipment WHERE operating_company_id = $1\`);
      return { equipment: [], total: 0, limit, offset, has_more: false };
    });
    app.post("/api/v1/mdata/equipment", async () => {});
  `;
  const checks = [
    ["total+has_more+static-scope shape passes", check(good, goodApi).length === 0],
    ["bare { equipment } is caught", check(badBare, goodApi).length > 0],
    ["dynamic-only scope (filters.push) is caught", check(badDynamicOnly, goodApi).length > 0],
    ["phantom operating_company_id is caught", check(badPhantomCol, goodApi).length > 0],
    [
      "optional selected-company schema is caught",
      check(good.replace("operating_company_id: z.string().uuid(),", "operating_company_id: z.string().uuid().optional(),"), goodApi).length > 0,
    ],
    [
      "frontend omission is caught",
      check(good, goodApi.replace('qs.set("operating_company_id", params.operating_company_id);', "void params;")).length > 0,
    ],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:equipment-list-total-pagination --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:equipment-list-total-pagination --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:equipment-list-total-pagination FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:equipment-list-total-pagination PASS (equipment list returns total + has_more)");
}
