#!/usr/bin/env node
/**
 * GUARD: void-not-delete evidence tables must not carry a DELETE grant for ih35_app.
 *
 * WHY THIS EXISTS (found by the OWNER during prod verification of #3380, 2026-07-24)
 * Migration 202607820000 issued `GRANT SELECT, INSERT, UPDATE` on the three company-violation join
 * tables and I described that as "no DELETE grant". That was WRONG, and the reason matters:
 *
 *   GRANT is ADDITIVE. It adds privileges; it never removes one.
 *   The `safety` schema carries a DEFAULT PRIVILEGE of `ih35_app=arwd/neondb_owner` — the `d` is
 *   DELETE — so EVERY new table created in `safety` inherits DELETE at creation. The GRANT sat on
 *   top of that inherited DELETE and the tables shipped DELETE-able.
 *
 * Local validation could not catch it: I applied the migration to a throwaway database whose schema
 * default privileges differ from prod, so the same DDL produced INSERT,SELECT,UPDATE locally and
 * DELETE,INSERT,SELECT,UPDATE on prod. A local apply proves the DDL parses and is idempotent — it
 * does NOT prove the resulting ACL. PROD WINS.
 *
 * Therefore this guard reads the ACTUAL grant from information_schema.role_table_grants. Asserting
 * on migration TEXT would reproduce the exact mistake: the text said GRANT SELECT,INSERT,UPDATE and
 * the privilege was DELETE-able anyway. Only the real ACL is evidence.
 *
 * Precedent for the intended posture: safety.civil_fines is INSERT,SELECT,UPDATE on prod — DELETE
 * was explicitly REVOKEd there.
 *
 * Without a reachable database this exits 0 with an explicit CAPABILITY SKIP (verify:static runs
 * with a dead-port sentinel). It runs for real in verify:local-ci, which has a live local Postgres,
 * and against prod when pointed at it.
 */
import { createRequire } from "node:module";

const LABEL = "verify-safety-evidence-no-delete-grant";

/** Tables whose records are evidence under void-not-delete. DELETE must not be grantable. */
const NO_DELETE_TABLES = [
  "company_violation_drivers",
  "company_violation_units",
  "company_violation_fines",
  // civil_fines is included as the PRECEDENT: it has been hardened for a while, so if it ever
  // regains DELETE the schema default has re-granted it and everything else is suspect too.
  "civil_fines",
];

async function main() {
  const require = createRequire(import.meta.url);
  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = (await import("pg")).default;
  try {
    (await import("dotenv")).default.config();
  } catch {
    // dotenv optional — env may already be present.
  }

  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log(`${LABEL} CAPABILITY SKIP — no DATABASE_URL/DATABASE_DIRECT_URL; grants can only be read from a live database. CI equivalent: verify:local-ci (ephemeral Postgres).`);
    process.exit(0);
  }

  const { Client } = pg;
  const client = new Client(buildPgClientConfig(connectionString, { connectionTimeoutMillis: 15000 }));
  try {
    await client.connect();
  } catch (error) {
    console.log(`${LABEL} CAPABILITY SKIP — database unreachable (${error.code ?? error.message}). CI equivalent: verify:local-ci.`);
    process.exit(0);
  }

  try {
    const { rows } = await client.query(
      `SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS grants
         FROM information_schema.role_table_grants
        WHERE table_schema = 'safety' AND grantee = 'ih35_app' AND table_name = ANY($1)
        GROUP BY table_name`,
      [NO_DELETE_TABLES]
    );
    const byTable = new Map(rows.map((r) => [r.table_name, r.grants]));
    const problems = [];

    for (const table of NO_DELETE_TABLES) {
      const grants = byTable.get(table);
      if (grants === undefined) {
        // Absent is not a violation: the held migration that creates it may not be applied here.
        console.log(`${LABEL} note — safety.${table} not present in this database (held migration unapplied?), skipped.`);
        continue;
      }
      if (grants.split(",").includes("DELETE")) {
        problems.push(
          `safety.${table}: ih35_app holds DELETE (grants: ${grants}). This is an evidence table under ` +
            `void-not-delete. GRANT cannot fix it — the safety schema default privilege (ih35_app=arwd) ` +
            `re-grants DELETE on every new table, so it must be explicitly REVOKEd (see ` +
            `202607840000, and safety.civil_fines as the precedent).`
        );
      }
    }

    if (problems.length) {
      console.error(`${LABEL} FAILED:`);
      for (const p of problems) console.error(`  ${p}`);
      process.exit(1);
    }
    const checked = NO_DELETE_TABLES.filter((t) => byTable.has(t)).length;
    console.log(`${LABEL} OK — ${checked} evidence table(s) verified against the LIVE ACL: no DELETE for ih35_app.`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`${LABEL} FAILED — ${error.message}`);
  process.exit(1);
});
