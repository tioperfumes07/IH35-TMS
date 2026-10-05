#!/usr/bin/env node
// AUTH-402 (CC-2, 2026-10-05) — create ih35_guard_reader, the gate's truly read-only role.
//
// WHY: ih35_ci_readonly, the role every seat's guards connect as, is a member of neon_superuser (Neon grants it to
// every console-created role and refuses REVOKE: "permission denied to revoke role neon_superuser") and of ih35_app.
// Through them it holds INSERT / UPDATE / DELETE on the ledger. A role created by SQL is not a neon_superuser member.
// ih35_guard_reader: LOGIN, BYPASSRLS (guards measure every company), pg_read_all_data, default_transaction_read_only
// = on, NOCREATEROLE, NOCREATEDB, no write grant anywhere. Every write is refused twice: by the read-only default,
// and, with READ WRITE forced, by privilege.
//
// The password is read from a 0600 local file (argv[2]) and is never printed, logged or committed. The connection
// that creates the role is DATABASE_URL (a role holding CREATEROLE; the gate credential has it).
//
// Usage:
//   rehearsal:  node --env-file=<env> scripts/ops/2026-10-05-cc2-provision-guard-reader-role.mjs <pw-file> [<host>]
//   production: OWNER_AUTH_ID=AUTH-402 node --env-file=<env> scripts/ops/2026-10-05-cc2-provision-guard-reader-role.mjs <pw-file>
// <host> swaps the endpoint host (rehearsal branches only). Idempotent: an existing role is ALTERed to the same shape.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertNotProduction, assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "scripts/ops/2026-10-05-cc2-provision-guard-reader-role.mjs";
const AUTH_ID = process.env.OWNER_AUTH_ID || "";
const [pwFile, host] = process.argv.slice(2);
if (!pwFile) throw new Error("usage: <pw-file> [<host>]");
if (AUTH_ID && host) throw new Error("production runs never swap the host");
const pw = fs.readFileSync(pwFile, "utf8").trim();
if (!/^[A-Za-z0-9_-]{24,}$/.test(pw)) throw new Error("password file malformed (expect >= 24 url-safe chars)");

const admin = new URL(process.env.DATABASE_URL);
if (host) admin.hostname = host;
const reader = new URL(admin.toString());
reader.username = "ih35_guard_reader";
reader.password = pw;

async function withClient(url, fn) {
  const c = new pg.Client({ connectionString: url.toString() });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

if (AUTH_ID) execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });

await withClient(admin, async (c) => {
  await (AUTH_ID ? assertIsIntendedProduction : assertNotProduction)(c, { label: LABEL });
  const exists = (await c.query(`SELECT 1 FROM pg_roles WHERE rolname = 'ih35_guard_reader'`)).rowCount > 0;
  // pw is validated to [A-Za-z0-9_-] above, so it cannot close the literal.
  await c.query(`${exists ? "ALTER" : "CREATE"} ROLE ih35_guard_reader LOGIN BYPASSRLS INHERIT NOCREATEROLE NOCREATEDB PASSWORD '${pw}'`);
  await c.query(`GRANT pg_read_all_data TO ih35_guard_reader`);
  await c.query(`ALTER ROLE ih35_guard_reader SET default_transaction_read_only = on`);
  console.log(`${exists ? "ROLE ALTERED" : "ROLE CREATED"}: ih35_guard_reader`);
});

const proof = await withClient(reader, async (c) => {
  const r = {};
  r.who = (await c.query(`SELECT current_user AS u`)).rows[0].u;
  r.member_of = (await c.query(`SELECT array_agg(g.rolname ORDER BY g.rolname)::text AS m FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid JOIN pg_roles u ON u.oid = m.member WHERE u.rolname = current_user`)).rows[0].m;
  r.attrs = (await c.query(`SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolconfig::text FROM pg_roles WHERE rolname = current_user`)).rows[0];
  r.transaction_read_only = (await c.query(`SHOW transaction_read_only`)).rows[0].transaction_read_only;
  r.write_grants = (await c.query(`SELECT count(*)::int AS n FROM information_schema.role_table_grants WHERE grantee = current_user AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')`)).rows[0].n;
  r.journal_entries_insert_privilege = (await c.query(`SELECT has_table_privilege(current_user, 'accounting.journal_entries', 'INSERT') AS i`)).rows[0].i;
  r.bank_lines_visible_all_companies = (await c.query(`SELECT count(*)::int AS n FROM banking.bank_transactions`)).rows[0].n;
  for (const [name, sql] of [
    ["write_default_transaction", `INSERT INTO accounting.journal_entries DEFAULT VALUES`],
    ["write_forced_read_write", `BEGIN; SET TRANSACTION READ WRITE; INSERT INTO accounting.journal_entries DEFAULT VALUES; ROLLBACK`],
  ]) {
    try { await c.query(sql); r[name] = "ACCEPTED"; } catch (e) { r[name] = "refused: " + String(e.message).split("\n")[0]; await c.query("ROLLBACK").catch(() => {}); }
  }
  return r;
});
console.log(JSON.stringify(proof, null, 1));

const bad = [];
if (proof.who !== "ih35_guard_reader") bad.push("did not log in as ih35_guard_reader");
if (proof.member_of !== "{pg_read_all_data}") bad.push(`unexpected memberships ${proof.member_of}`);
if (proof.attrs.rolsuper || proof.attrs.rolcreaterole || proof.attrs.rolcreatedb || !proof.attrs.rolbypassrls) bad.push("role attributes wrong");
if (proof.transaction_read_only !== "on") bad.push("sessions are not read-only by default");
if (proof.write_grants !== 0 || proof.journal_entries_insert_privilege) bad.push("role holds a write privilege");
if (!(proof.bank_lines_visible_all_companies > 0)) bad.push("reads nothing: an empty result is an instrument problem");
if (!String(proof.write_default_transaction).startsWith("refused") || !String(proof.write_forced_read_write).startsWith("refused")) bad.push("a write was accepted");
if (bad.length) { console.error(`${LABEL}: FAIL — ${bad.join("; ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — ih35_guard_reader reads every company and cannot write.`);
