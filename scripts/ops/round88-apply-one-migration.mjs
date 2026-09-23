#!/usr/bin/env node
// Round 88 — applies ONE named migration exactly as scripts/db-migrate.mjs applyMigration() does
// (same search_path, one transaction, the SQL, then both ledger rows), and nothing else.
// db:migrate applies every pending file; on production that set includes other seats' migrations
// that were deliberately never applied (202609250000_flt_02_real_fleet_owned_by_trk among them),
// so it cannot be used to land a single migration.
//
//   DATABASE_URL=<owner url> node scripts/ops/round88-apply-one-migration.mjs <file.sql>
//
// Refuses: a file not in db/migrations, a file already in _system._schema_migrations, a held
// migration, or the production endpoint without ALLOW_PROD_MIGRATE=1.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const SEARCH_PATH =
  "mdata, dispatch, docs, catalogs, identity, org, integrations, qbo_archive, accounting, banking, factor, documents, pwa, audit, outbox, safety, fuel, driver_finance, maintenance, views, public, email";
const PROD_HOST_MARKER = "ep-broad-block-akykk7bw";

const file = process.argv[2];
const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!file || !url) {
  console.error("usage: DATABASE_URL=<url> node scripts/ops/round88-apply-one-migration.mjs <file.sql>");
  process.exit(1);
}
const abs = path.resolve("db/migrations", path.basename(file));
if (!fs.existsSync(abs)) {
  console.error(`REFUSED — ${abs} does not exist`);
  process.exit(1);
}
const held = JSON.parse(fs.readFileSync("db/migrations/.held-migrations.json", "utf8"));
if (JSON.stringify(held).includes(path.basename(abs))) {
  console.error(`REFUSED — ${path.basename(abs)} is a held migration`);
  process.exit(1);
}
const host = new URL(url).hostname;
if (host.includes(PROD_HOST_MARKER) && process.env.ALLOW_PROD_MIGRATE !== "1") {
  console.error(`REFUSED — ${host} is the production endpoint; set ALLOW_PROD_MIGRATE=1 on purpose`);
  process.exit(1);
}

const name = path.basename(abs);
const sql = fs.readFileSync(abs, "utf8");
const checksum = crypto.createHash("sha256").update(sql, "utf8").digest("hex");
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const already = await client.query("SELECT 1 FROM _system._schema_migrations WHERE filename = $1", [name]);
  if (already.rowCount > 0) {
    console.error(`REFUSED — ${name} is already in _system._schema_migrations`);
    process.exit(1);
  }
  const start = Date.now();
  await client.query(`SET search_path = ${SEARCH_PATH};`);
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL search_path = ${SEARCH_PATH};`);
    await client.query(sql);
    await client.query(
      "INSERT INTO _system._schema_migrations (filename, checksum, duration_ms) VALUES ($1, $2, $3);",
      [name, checksum, Date.now() - start]
    );
    await client.query("INSERT INTO ih35_migrations.applied_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING;", [name]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  console.log(`applied ${name} on ${host} in ${Date.now() - start} ms, checksum ${checksum}`);
} finally {
  await client.end();
}
