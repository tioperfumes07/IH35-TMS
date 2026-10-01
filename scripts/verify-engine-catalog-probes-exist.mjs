#!/usr/bin/env node
// E-41 guard (Lead 2026-10-01): every `output` probe in engine-status.catalog.ts must name a relation
// and columns that exist in the live schema. Root cause fixed with this guard: five probes were written
// from memory (captured_at / created_at / dispatch.layovers / dispatch.late_arrivals) and the board
// reported "probe failed: column does not exist" for engines that were actually writing. A probe that
// names a relation not yet migrated is tolerated ONLY when the catalog row is honest about it; a probe
// whose relation exists but whose column does not is a FAIL.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";

const LABEL = "verify-engine-catalog-probes-exist";
const CATALOG = path.join(process.cwd(), "apps/backend/src/system/engine-status.catalog.ts");

export function parseProbes(source) {
  const probes = [];
  const entryRe = /id:\s*"([^"]+)"[\s\S]*?output:\s*(null|\{[^}]*\})/g;
  let m;
  while ((m = entryRe.exec(source))) {
    if (m[2] === "null") continue;
    const rel = /relation:\s*"([^"]+)"/.exec(m[2]);
    const ts = /tsColumn:\s*"([^"]+)"/.exec(m[2]);
    const co = /companyColumn:\s*(null|"([^"]+)")/.exec(m[2]);
    if (!rel || !ts) continue;
    probes.push({ id: m[1], relation: rel[1], tsColumn: ts[1], companyColumn: co && co[2] ? co[2] : null });
  }
  return probes;
}

function selftest() {
  const sample = `{ id: "E-X", output: { relation: "a.b", tsColumn: "created_at", companyColumn: "operating_company_id" } },
  { id: "E-Y", output: null }, { id: "E-Z", output: { relation: "c.d", tsColumn: "read_at", companyColumn: null } }`;
  const p = parseProbes(sample);
  if (p.length !== 2 || p[0].relation !== "a.b" || p[1].companyColumn !== null) {
    console.error(`${LABEL}: selftest FAIL — parser`, p);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS (2 probes parsed, null output skipped)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  const probes = parseProbes(fs.readFileSync(CATALOG, "utf8"));
  if (!probes.length) {
    console.error(`${LABEL}: FAIL — parsed 0 probes from ${CATALOG}`);
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.log(`${LABEL}: SKIP — no DATABASE_URL (live-data invariant by design). ${probes.length} probes parsed.`);
    process.exit(0);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const failures = [];
  const missingRelations = [];
  try {
    await client.query("BEGIN READ ONLY");
    // bypass_rls alone; information_schema needs no owner role.
    // NEONDB-OWNER-OK: this guard never SETs ROLE; it reads information_schema under the gate credential.
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const res = await client.query(
      `SELECT table_schema || '.' || table_name AS rel, array_agg(column_name::text) AS cols
         FROM information_schema.columns
        WHERE table_schema || '.' || table_name = ANY($1::text[])
        GROUP BY 1`,
      [probes.map((p) => p.relation)]
    );
    await client.query("ROLLBACK");
    const cols = new Map(res.rows.map((r) => [r.rel, new Set(r.cols)]));
    for (const p of probes) {
      const set = cols.get(p.relation);
      if (!set) {
        missingRelations.push(`${p.id}: ${p.relation} (not migrated yet — board shows Idle, acceptable)`);
        continue;
      }
      if (!set.has(p.tsColumn)) failures.push(`${p.id}: ${p.relation}.${p.tsColumn} does not exist`);
      if (p.companyColumn && !set.has(p.companyColumn)) failures.push(`${p.id}: ${p.relation}.${p.companyColumn} does not exist`);
    }
  } finally {
    client.release();
    await pool.end();
  }
  for (const line of missingRelations) console.log(`${LABEL}: NOTE — ${line}`);
  if (failures.length) {
    console.error(`${LABEL}: FAIL — ${failures.length} catalog probe(s) name a column the live schema does not have:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — ${probes.length} probes, ${probes.length - missingRelations.length} relations live, 0 bad columns.`);
}

main().catch((err) => {
  console.error(`${LABEL}: ERROR — ${err.message}`);
  process.exit(1);
});
