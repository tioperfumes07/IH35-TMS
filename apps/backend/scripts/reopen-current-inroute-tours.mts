#!/usr/bin/env node
/**
 * REOPEN CURRENT IN-ROUTE TOURS — one fresh clean tour + instant number per live leg.
 *
 * Owner ruling 2026-09-11 (verbatim decisions): "Each in-route load = its own fresh clean tour +
 * instant number now; detach from the paid Aug tour_ids; never touch paid Aug loads." A tour is NOT
 * weekly pay — it is pay for the drive-days of ONE round trip and can span two months. The seed had
 * stapled these live return legs onto ALREADY-PAID August tour_ids (13591->5797, 13592->5799,
 * 13593->5795/5779, ...). That is corruption, not a legit two-month tour. This detaches each live
 * leg onto its own fresh tour_id and opens ONE honest current settlement for it, which the wired
 * instant-number minter (allocateNextSettlementSourceDocumentRef, 5804+) numbers at open.
 *
 * Reuses the SAME reviewed booking path — NO new linking logic:
 *   linkLoadToPresettlementAtBookingInClientTx -> suggestPresettlementLink + confirmPresettlementLink
 * (both run in MY client transaction — so this is a TRUE preview/rollback, unlike the GL poster).
 *
 * SCOPE: only loads that are (a) still moving (status='dispatched'), (b) currently UNLINKED
 * (presettlement_link_id IS NULL), (c) load_number >= 13590. Already-paid August loads are never in
 * scope and are never read for write. Each gets a brand-new tour_id BEFORE linking so it can never
 * inherit a paid tour.
 *
 * SAFETY: PREVIEW by default (BEGIN -> link all -> print -> ROLLBACK). Persist only with `--commit`
 * AND env REOPEN_I_UNDERSTAND=yes. Targets the live USMCA branch via DATABASE_URL.
 *
 * Usage:
 *   DATABASE_URL="postgres://…branch…" npx tsx scripts/reopen-current-inroute-tours.mts             # PREVIEW
 *   DATABASE_URL=… REOPEN_I_UNDERSTAND=yes npx tsx scripts/reopen-current-inroute-tours.mts --commit # persist
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { linkLoadToPresettlementAtBookingInClientTx } from "../src/dispatch/presettlement-link.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA
const ACTOR = "4fe45bd3-83a0-4612-b99f-ce33072da01c"; // usmcafreightsolutions (real USMCA user)

type Db = pg.PoolClient;

type InRouteLoad = {
  id: string;
  load_number: string;
  trip_type: "NB" | "TR" | "SB" | "LOCAL" | null;
  driver_id: string | null;
  unit_id: string | null;
  old_tour_id: string | null;
};

async function fetchInRoute(client: Db): Promise<InRouteLoad[]> {
  const res = await client.query<InRouteLoad>(
    `SELECT l.id::text, l.load_number, l.trip_type,
            l.assigned_primary_driver_id::text AS driver_id,
            l.assigned_unit_id::text AS unit_id,
            l.tour_id::text AS old_tour_id
       FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
        AND l.status = 'dispatched'
        AND l.presettlement_link_id IS NULL
        AND l.load_number ~ '^[0-9]+$'
        AND l.load_number::int >= 13587
      ORDER BY l.load_number`,
    [OPCO]
  );
  return res.rows;
}

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");
  const confirmed = commit && process.env.REOPEN_I_UNDERSTAND === "yes";
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL required (the live USMCA branch connection string).");
  if (commit && !confirmed) throw new Error("--commit requires env REOPEN_I_UNDERSTAND=yes");

  console.log(`=== REOPEN CURRENT IN-ROUTE TOURS (${commit ? "COMMIT" : "PREVIEW"}) ===`);
  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id',$1,true)", [OPCO]);

    const loads = await fetchInRoute(client as unknown as Db);
    console.log(`in-route unlinked loads: ${loads.map((l) => `${l.load_number}(${l.trip_type})`).join(", ") || "none"}`);
    if (!loads.length) {
      await client.query("ROLLBACK");
      console.log("nothing to do.");
      return;
    }

    const results: { load: string; settlement_id: string; ref: string | null }[] = [];
    for (const l of loads) {
      if (!l.driver_id || !l.trip_type) {
        console.log(`SKIP ${l.load_number}: missing ${!l.driver_id ? "driver" : "trip_type"} — cannot open a tour honestly.`);
        continue;
      }
      // Fresh tour_id so this live leg can NEVER inherit a paid August tour.
      const freshTour = randomUUID();
      await (client as unknown as Db).query(
        `UPDATE mdata.loads SET tour_id = $1::uuid, updated_at = now()
          WHERE id = $2::uuid AND operating_company_id = $3::uuid`,
        [freshTour, l.id, OPCO]
      );
      const linked = await linkLoadToPresettlementAtBookingInClientTx(client as unknown as Db, {
        operating_company_id: OPCO,
        load_id: l.id,
        driver_id: l.driver_id,
        unit_id: l.unit_id,
        trip_type: l.trip_type,
        tour_id: freshTour,
        actor_user_id: ACTOR,
      });
      const ref = await (client as unknown as Db).query<{ source_document_ref: string | null; display_id: string }>(
        `SELECT source_document_ref, display_id FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
        [linked.settlement_id]
      );
      results.push({ load: l.load_number, settlement_id: linked.settlement_id, ref: ref.rows[0]?.source_document_ref ?? null });
      console.log(`  ${l.load_number} ${l.trip_type} -> settlement ${linked.settlement_id.slice(0, 8)} (${linked.action}) instant number ${ref.rows[0]?.source_document_ref ?? "NULL"}`);
    }

    const numbered = results.filter((r) => r.ref && /^\d+$/.test(r.ref));
    const ok = numbered.length === results.length && results.length > 0;
    console.log(`\n${results.length} tour(s) opened; ${numbered.length} carry an instant number (${numbered.map((r) => r.ref).join(", ")}).`);

    if (confirmed && ok) {
      await client.query("COMMIT");
      console.log(`COMMITTED — ${results.length} current in-route tours re-established with instant numbers.`);
      process.exitCode = 0;
    } else if (confirmed && !ok) {
      await client.query("ROLLBACK");
      console.log(`ROLLED BACK — not every opened tour got a number.`);
      process.exitCode = 1;
    } else {
      await client.query("ROLLBACK");
      console.log(`PREVIEW ONLY — ROLLED BACK. ${ok ? "All opened tours numbered." : "Check output."} Re-run with --commit + REOPEN_I_UNDERSTAND=yes.`);
      process.exitCode = ok ? 0 : 1;
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("\nROLLED BACK — executor threw:", e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
