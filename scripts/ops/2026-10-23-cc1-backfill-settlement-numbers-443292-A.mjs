#!/usr/bin/env node
// ROUND 443.292-A backfill — assign AlwaysTrack settlement numbers to P-0113, P-0117, P-0119
// (closed 10-23 with no source_document_ref; the close engine now assigns at close, but these
// three slipped through before that engine change landed). Processed in trip_closed_at ASC order
// so they receive consecutive numbers (max+1 each) matching the AlwaysTrack sequence.
// Each settlement is handled in its own transaction + advisory lock so concurrent writes never
// grab the same number. DRY_RUN=1 rolls back and prints the would-be numbers.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";

const LABEL = "443.292-A-backfill-settlement-numbers";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DISPLAY_IDS = ["P-0113", "P-0117", "P-0119"]; // must be ordered; re-ordered below by trip_closed_at
const FLOOR = 5803; // last AT-imported number; first minted = 5804
const DRY = process.env.DRY_RUN === "1";

// ROUND 133 P0 — every scripts/ops/ financial writer must call verify-owner-authorization.mjs
// before a live write. DRY_RUN=1 skips the gate so measurement still works without AUTH.
{
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  if (!DRY) {
    const authId = process.env.OWNER_AUTH_ID;
    if (!authId) {
      console.error("OWNER_AUTH_ID required when DRY_RUN!=1 (ROUND 133 P0)");
      process.exit(1);
    }
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), authId], { stdio: "inherit" });
  }
}

class Rollback extends Error {}

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL required"); process.exit(1); }
  const pool = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pool.connect();

  // Find and order the three settlements by trip_closed_at ASC
  const lookupRes = await pool.query(
    `SELECT id::text, display_id, status, source_document_ref, trip_closed_at
       FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid AND display_id = ANY($2::text[])
      ORDER BY trip_closed_at ASC NULLS LAST`,
    [USMCA, DISPLAY_IDS]
  );

  const found = lookupRes.rows;
  if (found.length !== DISPLAY_IDS.length) {
    console.error(`Expected ${DISPLAY_IDS.length} rows, got ${found.length}: ${found.map((r) => r.display_id).join(", ")}`);
    await pool.end(); process.exit(1);
  }
  const alreadyHaveRef = found.filter((r) => r.source_document_ref);
  if (alreadyHaveRef.length) {
    console.log(`Already numbered: ${alreadyHaveRef.map((r) => `${r.display_id}=${r.source_document_ref}`).join(", ")} — skipping those`);
  }
  const toProcess = found.filter((r) => !r.source_document_ref);
  if (toProcess.length === 0) { console.log("All settlements already have numbers."); await pool.end(); return; }

  const results = [];
  for (const row of toProcess) {
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
    let ok = false;
    const st = { settlement: row.display_id, id: row.id };
    try {
      // Verify still unnumbered + correct state
      const check = (await c.query(
        `SELECT status, source_document_ref FROM driver_finance.driver_settlements WHERE id=$1::uuid FOR UPDATE`,
        [row.id]
      )).rows[0];
      if (!check) throw new Error("not found at lock time");
      if (check.source_document_ref) { st.note = `already numbered: ${check.source_document_ref} — skipping`; throw new Rollback("already_numbered"); }
      if (!["closed", "finalized", "locked", "cancelled"].includes(check.status)) throw new Error(`unexpected status: ${check.status}`);

      // Advisory lock for this company's AT sequence
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`settlement-source-doc-ref:${USMCA}`]);

      // Allocate next number
      const nextRes = await c.query(
        `SELECT (GREATEST($2::int, COALESCE(MAX((source_document_ref)::int), 0)) + 1)::text AS next
           FROM driver_finance.driver_settlements
          WHERE operating_company_id = $1::uuid AND source_document_ref ~ '^[0-9]+$'`,
        [USMCA, FLOOR]
      );
      const next = nextRes.rows[0]?.next;
      if (!next) throw new Error("could not compute next settlement number");

      // Write the number
      const writeRes = await c.query(
        `UPDATE driver_finance.driver_settlements
            SET source_document_ref = $3, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
          RETURNING id::text, display_id, source_document_ref`,
        [row.id, USMCA, next]
      );
      if (!writeRes.rows[0]) throw new Error(`UPDATE returned 0 rows`);

      await appendCrudAudit(c, OWNER, "driver_finance.settlement.source_document_ref_set",
        { resource_type: "driver_finance.driver_settlements", resource_id: row.id, operating_company_id: USMCA,
          display_id: row.display_id, source_document_ref: next, round: LABEL, backfill: true },
        "info", LABEL);

      Object.assign(st, { assigned: next, status: check.status, result: "OK" });
      if (DRY) throw new Rollback("dry");
      await c.query("COMMIT"); ok = true; st.committed = true;
    } catch (err) {
      st.error = err instanceof Rollback ? `ROLLBACK: ${err.message}` : (err instanceof Error ? err.message : String(err));
      if (!(err instanceof Rollback)) st.result = "FAILED";
    } finally { if (!ok) await c.query("ROLLBACK").catch(() => {}); await c.end(); }
    results.push(st);
  }

  await pool.end();
  console.log(JSON.stringify(results, null, 2));
  const failures = results.filter((r) => r.result === "FAILED");
  if (failures.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
