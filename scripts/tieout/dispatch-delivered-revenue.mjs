#!/usr/bin/env node
/**
 * DISP-TIEOUT-01 — every delivered USMCA load maps to invoiced revenue, zero orphans both
 * directions, tolerance 0.
 *
 * Scoped to USMCA only (matches every other tie-out in this suite and the "USMCA only" law —
 * TRANSP's loads are frozen/a report, not a build, per CC-1-HUMAN-SEQUENCE-REPLAY.txt rule 5;
 * verified live before writing this that TRANSP has 11,979 non-void invoices and ZERO of them
 * carry source_load_id at all — that is 11+ years of real, pre-TMS QBO history, not a dispatch
 * defect, and running this check against TRANSP would report ~12,000 false orphans that have
 * nothing to do with the real question this tie-out asks).
 *
 * "Delivered" = load status IN ('delivered', 'delivered_pending_docs', 'completed_docs_received')
 * — all three represent a load that has genuinely been delivered, whether or not the paperwork
 * (POD) has fully landed yet.
 *
 *   delivered_load_invoice_orphans — a delivered USMCA load with no live (non-void) invoice
 *     referencing it via accounting.invoices.source_load_id. A load that was actually driven
 *     and delivered but never billed.
 *
 *   invoice_without_delivered_load — a live (non-void) USMCA invoice whose source_load_id is
 *     either null or points to a load that has not reached a delivered status. Revenue
 *     recognized ahead of, or disconnected from, an actual delivery.
 *
 * Both are recorded honestly. As of 2026-08-30 the majority of invoice_without_delivered_load
 * hits are expected, not new defects: the 33 Faro-invoice CSV backload created draft invoices
 * ahead of their loads (the loads themselves are still being built one at a time per
 * CC-1-HUMAN-SEQUENCE-REPLAY.txt) — this script reports the true live count either way, never
 * pre-filtered to hide the expected cases, per R2 (empty is never PASS, and neither is a
 * silently-shrunk list).
 */
import pg from "pg";
import { fail, requireDb, unverified } from "./_lib.mjs";
import pgConnectionOptions from "../lib/pg-connection-options.cjs";

const { buildPgPoolConfig } = pgConnectionOptions;

const USMCA_OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DELIVERED_STATUSES = ["delivered", "delivered_pending_docs", "completed_docs_received"];

export const EXPECTED = { delivered_load_invoice_orphans: 0, invoice_without_delivered_load: 0 };

if (process.argv.includes("--expected-only")) {
  console.log(JSON.stringify(EXPECTED));
  process.exit(0);
}

const url = requireDb();

async function main() {
  const pool = new pg.Pool(buildPgPoolConfig(url));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const jeControl = await client.query(
      "SELECT count(*)::int AS n FROM accounting.journal_entries"
    );
    if (!jeControl.rows[0] || jeControl.rows[0].n < 2219) {
      await client.query("ROLLBACK");
      unverified(
        `je_control discriminator too low (${jeControl.rows[0]?.n ?? "null"}, expected >= 2219) — session/bypass context not trusted`
      );
    }

    const loadOrphans = await client.query(
      `SELECT l.id, l.load_number, l.status
       FROM mdata.loads l
       WHERE l.operating_company_id = $1::uuid
         AND l.status::text = ANY($2::text[])
         AND NOT EXISTS (
           SELECT 1 FROM accounting.invoices i
           WHERE i.source_load_id = l.id AND i.status <> 'void'
         )
       ORDER BY l.load_number`,
      [USMCA_OPCO, DELIVERED_STATUSES]
    );

    const invoiceOrphans = await client.query(
      `SELECT i.id, i.display_id, i.status, i.source_load_id
       FROM accounting.invoices i
       WHERE i.operating_company_id = $1::uuid
         AND i.status <> 'void'
         AND (
           i.source_load_id IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM mdata.loads l
             WHERE l.id = i.source_load_id AND l.status::text = ANY($2::text[])
           )
         )
       ORDER BY i.display_id`,
      [USMCA_OPCO, DELIVERED_STATUSES]
    );

    await client.query("COMMIT");

    const observed = {
      delivered_load_invoice_orphans: loadOrphans.rows.length,
      invoice_without_delivered_load: invoiceOrphans.rows.length,
    };
    console.log(`TIEOUT OBSERVED: ${JSON.stringify(observed)}`);

    const diffs = [];
    if (observed.delivered_load_invoice_orphans !== EXPECTED.delivered_load_invoice_orphans) {
      diffs.push(
        `delivered_load_invoice_orphans: observed ${observed.delivered_load_invoice_orphans} vs expected ${EXPECTED.delivered_load_invoice_orphans} — ` +
          loadOrphans.rows.map((r) => `${r.load_number} [${r.status}]`).join(", ")
      );
    }
    if (observed.invoice_without_delivered_load !== EXPECTED.invoice_without_delivered_load) {
      diffs.push(
        `invoice_without_delivered_load: observed ${observed.invoice_without_delivered_load} vs expected ${EXPECTED.invoice_without_delivered_load} — ` +
          invoiceOrphans.rows.map((r) => `${r.display_id} [${r.status}]${r.source_load_id ? "" : " (no source_load_id)"}`).join(", ")
      );
    }

    if (diffs.length) {
      fail(`DISP-TIEOUT-01 FAIL (${diffs.length} mismatch(es)):\n  ` + diffs.join("\n  "));
    }

    console.log("TIEOUT PASS: every delivered USMCA load maps to invoiced revenue, zero orphans both directions");
    process.exit(0);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failure, the connection is being released regardless
    }
    fail(`DISP-TIEOUT-01 errored: ${e.message}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
