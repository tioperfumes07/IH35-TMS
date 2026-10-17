#!/usr/bin/env node
/**
 * ROUND 443.198 (LEAD 18:45Z) — no table is writable by PUBLIC.
 *
 * Prod held 439 INSERT/UPDATE/DELETE/TRUNCATE privileges granted to PUBLIC on 172 relations in 14 schemas, plus schema
 * default ACLs giving PUBLIC "arw" on new tables in audit / banking / driver_finance — so ANY role (ih35_guard_reader,
 * agent_rw) could write. The step-2 migration revoked them and gave ih35_app explicit grants from code evidence.
 *
 *  STATIC (always): no migration may GRANT a write privilege TO PUBLIC, or ALTER DEFAULT PRIVILEGES … GRANT … TO PUBLIC.
 *    The two historical files that did (0167 notification prefs, 0168 password reset tokens) are named below — they run
 *    before the revoke; nothing new may join them.
 *  LIVE (when DATABASE_URL / DATABASE_DIRECT_URL is set — the read-only guard reader in the live job): zero PUBLIC write
 *    privileges on any non-system relation and zero PUBLIC write entries in pg_default_acl.
 *
 * --selftest plants each violation shape and proves it is caught.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-public-write-grants";
const MIGRATIONS = join(ROOT, "db/migrations");
const HISTORICAL = new Set(["0167_p7_block_e_notif_prefs.sql", "0168_password_reset_tokens.sql"]);

const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
const GRANT_WRITE_TO_PUBLIC = /\bGRANT\s+[^;]*?\b(INSERT|UPDATE|DELETE|TRUNCATE|ALL)\b[^;]*?\bTO\s+(?:[A-Za-z0-9_",\s]*,\s*)?PUBLIC\b/i;
const DEFAULT_TO_PUBLIC = /\bALTER\s+DEFAULT\s+PRIVILEGES\b[^;]*?\bGRANT\s+[^;]*?\b(INSERT|UPDATE|DELETE|TRUNCATE|ALL)\b[^;]*?\bTO\s+(?:[A-Za-z0-9_",\s]*,\s*)?PUBLIC\b/i;

export function staticProblems(files) {
  const problems = [];
  for (const [name, sql] of files) {
    if (HISTORICAL.has(name)) continue;
    const body = stripComments(sql);
    for (const stmt of body.split(";")) {
      if (DEFAULT_TO_PUBLIC.test(stmt)) problems.push(`${name}: ALTER DEFAULT PRIVILEGES grants a write privilege TO PUBLIC — new tables would be born writable by every role`);
      else if (GRANT_WRITE_TO_PUBLIC.test(stmt)) problems.push(`${name}: GRANT of a write privilege TO PUBLIC — grant ih35_app explicitly instead`);
    }
  }
  return problems;
}

export const LIVE_SQL = `
  SELECT
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, LATERAL aclexplode(c.relacl) a
      WHERE c.relacl IS NOT NULL AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_%'
        AND a.grantee = 0 AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'))::int AS public_table_writes,
    (SELECT count(*) FROM pg_default_acl d, LATERAL aclexplode(d.defaclacl) a
      WHERE d.defaclobjtype = 'r' AND a.grantee = 0 AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'))::int AS public_default_writes`;

function migrationFiles() {
  return readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort().map((f) => [f, readFileSync(join(MIGRATIONS, f), "utf8")]);
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["real migrations pass", migrationFiles(), 0],
    ["GRANT INSERT ... TO PUBLIC caught", [["9999_x.sql", "GRANT SELECT, INSERT ON banking.x TO PUBLIC;"]], 1],
    ["GRANT ALL ... TO ih35_app, PUBLIC caught", [["9999_x.sql", "GRANT ALL ON mdata.y TO ih35_app, PUBLIC;"]], 1],
    ["ALTER DEFAULT PRIVILEGES ... TO PUBLIC caught", [["9999_x.sql", "ALTER DEFAULT PRIVILEGES IN SCHEMA audit GRANT INSERT ON TABLES TO PUBLIC;"]], 1],
    ["GRANT SELECT ... TO PUBLIC allowed (reads are out of scope)", [["9999_x.sql", "GRANT SELECT ON views.z TO PUBLIC;"]], 0],
    ["a commented-out grant is ignored", [["9999_x.sql", "-- GRANT INSERT ON a.b TO PUBLIC;\nSELECT 1;"]], 0],
    ["the two historical files stay allowed by name only", [["0167_p7_block_e_notif_prefs.sql", "GRANT INSERT ON identity.user_notification_preferences TO PUBLIC;"]], 0],
  ];
  let ok = 0;
  for (const [name, files, want] of cases) {
    const got = staticProblems(files).length;
    const pass = want === 0 ? got === 0 : got >= want;
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : ` (got ${got})`}`);
    if (pass) ok++;
  }
  console.log(`${LABEL} --selftest ${ok}/${cases.length}`);
  process.exit(ok === cases.length ? 0 : 1);
}

const problems = staticProblems(migrationFiles());
const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL;
if (url) {
  const pg = (await import("pg")).default;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const r = (await client.query(LIVE_SQL)).rows[0];
    if (r.public_table_writes > 0) problems.push(`LIVE: ${r.public_table_writes} PUBLIC write privilege(s) on app relations`);
    if (r.public_default_writes > 0) problems.push(`LIVE: ${r.public_default_writes} PUBLIC write entr(ies) in pg_default_acl — new tables are born writable`);
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
}
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length}:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — no migration grants writes to PUBLIC${url ? "; live: 0 PUBLIC write privileges, 0 PUBLIC write defaults" : " (static; live check runs with DATABASE_URL)"}`);
