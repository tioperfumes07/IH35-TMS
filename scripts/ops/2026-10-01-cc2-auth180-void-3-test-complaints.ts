/**
 * AUTH-180 — void the three coder test complaints live in USMCA (board row
 * COMPLAINTS-CODER-TEST-ROWS-LIVE-IN-USMCA-2026100101). VOID, never delete: voided_at, voided_by,
 * void_reason only. Owner, 2026-10-01: "you have mny authorization to void these test items, anyone
 * can void a test and sample and demo itemn, not real transactions."
 *
 * Refuses any id that is already voided, missing, outside USMCA, or whose summary no longer reads as
 * a test fixture — a real complaint can never be swept in by this script.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-01-cc2-auth180-void-3-test-complaints.ts [--apply]
 * (dry run by default; --apply gated by verify-owner-authorization.mjs AUTH-180)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-180";
const OWNER_EMAIL = "tioperfumes07@gmail.com";
const IDS = [
  "5e691a6a-a3bc-48b8-935f-8144be577509",
  "9e52b358-690c-47bc-9fac-18f704f6a4bb",
  "e81cd567-92eb-412e-888a-241842ea181b",
];
const TEST_MARKER = /TEST DATA|CODEX|smoke/i;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`${AUTH_ID} rejected by verify-owner-authorization.mjs -- refusing --apply.`);
      process.exit(1);
    }
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    if (APPLY) await assertIsIntendedProduction(client);
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const owner = await client.query<{ id: string }>(`SELECT id::text FROM identity.users WHERE lower(email) = $1`, [OWNER_EMAIL]);
    if (owner.rows.length !== 1) throw new Error(`owner user ${OWNER_EMAIL} not found exactly once`);
    const rows = await client.query<{ id: string; summary: string | null; voided_at: string | null; operating_company_id: string }>(
      `SELECT id::text, summary, voided_at::text, operating_company_id::text FROM safety.complaints WHERE id = ANY($1::uuid[])`,
      [IDS]
    );
    const problems: string[] = [];
    for (const id of IDS) {
      const r = rows.rows.find((x) => x.id === id);
      if (!r) problems.push(`${id}: not found`);
      else if (r.operating_company_id !== USMCA) problems.push(`${id}: not USMCA`);
      else if (r.voided_at) problems.push(`${id}: already voided ${r.voided_at}`);
      else if (!TEST_MARKER.test(r.summary ?? "")) problems.push(`${id}: summary does not read as a test fixture — refusing`);
    }
    for (const r of rows.rows) console.log(`  ${r.id}  ${JSON.stringify(r.summary)}  voided_at=${r.voided_at ?? "null"}`);
    if (problems.length) {
      await client.query("ROLLBACK");
      console.error(`REFUSED: ${problems.join("; ")}`);
      process.exit(1);
    }
    if (!APPLY) {
      await client.query("ROLLBACK");
      console.log(`DRY RUN: would void ${IDS.length} test complaint(s) as ${owner.rows[0].id}. Re-run with --apply.`);
      return;
    }
    const upd = await client.query(
      `UPDATE safety.complaints
          SET voided_at = now(), voided_by = $2::uuid,
              void_reason = 'coder test fixture, not a real complaint (AUTH-180)'
        WHERE id = ANY($1::uuid[]) AND operating_company_id = $3::uuid AND voided_at IS NULL`,
      [IDS, owner.rows[0].id, USMCA]
    );
    if (upd.rowCount !== IDS.length) {
      await client.query("ROLLBACK");
      throw new Error(`expected ${IDS.length} rows, updated ${upd.rowCount} — rolled back`);
    }
    await client.query("COMMIT");
    console.log(`APPLIED: voided ${upd.rowCount} test complaint(s) under ${AUTH_ID}.`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

await main();
