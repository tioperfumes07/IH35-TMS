#!/usr/bin/env node
/**
 * DISP-TIEOUT-01 — every delivered USMCA load maps to invoiced revenue; zero orphans both ways.
 *
 * Two orphan counts (tolerance 0, empty is never PASS):
 *   delivered_load_invoice_orphans — delivered+ TMS load with no active invoice.source_load_id
 *   invoice_without_delivered_load — active TMS invoice whose source_load_id is null OR points
 *                                    to a load not in delivered+ status
 *
 * Delivered+ statuses mirror dispatch/factoring-queue.routes.ts revenue latch cohort.
 * Scoped to USMCA (launch entity) and accounting.invoices.source_system = 'tms'.
 */
import pg from "pg";
import { fail, requireDb, unverified } from "./_lib.mjs";
import pgConnectionOptions from "../lib/pg-connection-options.cjs";

const { buildPgPoolConfig } = pgConnectionOptions;

const USMCA_OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";

const DELIVERED_STATUSES = [
  "delivered",
  "delivered_pending_docs",
  "invoiced",
  "paid",
  "closed",
];

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

    const loadsRes = await client.query(
      `SELECT count(*)::int AS n
       FROM mdata.loads l
       WHERE l.operating_company_id = $1::uuid
         AND l.soft_deleted_at IS NULL
         AND l.status = ANY($2::mdata.load_status_enum[])`,
      [USMCA_OPCO, DELIVERED_STATUSES]
    );
    const invoicesRes = await client.query(
      `SELECT count(*)::int AS n
       FROM accounting.invoices i
       WHERE i.operating_company_id = $1::uuid
         AND i.voided_at IS NULL
         AND i.status NOT IN ('void', 'voided', 'draft')
         AND COALESCE(i.source_system, 'tms') = 'tms'`,
      [USMCA_OPCO]
    );
    if (loadsRes.rows[0]?.n === 0 && invoicesRes.rows[0]?.n === 0) {
      await client.query("ROLLBACK");
      fail(
        "DISP-TIEOUT-01 FAIL: zero USMCA delivered loads AND zero active TMS invoices — empty is never PASS (create loads/invoices via shadow Chrome first)"
      );
    }

    const loadOrphansRes = await client.query(
      `SELECT l.id, l.load_number, l.status, l.customer_wo_number
       FROM mdata.loads l
       WHERE l.operating_company_id = $1::uuid
         AND l.soft_deleted_at IS NULL
         AND l.status = ANY($2::mdata.load_status_enum[])
         AND NOT EXISTS (
           SELECT 1
           FROM accounting.invoices i
           WHERE i.source_load_id = l.id
             AND i.operating_company_id = l.operating_company_id
             AND i.voided_at IS NULL
             AND i.status NOT IN ('void', 'voided', 'draft')
             AND COALESCE(i.source_system, 'tms') = 'tms'
         )
       ORDER BY l.load_number
       LIMIT 25`,
      [USMCA_OPCO, DELIVERED_STATUSES]
    );

    const invoiceOrphansRes = await client.query(
      `SELECT i.id, i.display_id, i.status, i.source_load_id, l.load_number, l.status AS load_status
       FROM accounting.invoices i
       LEFT JOIN mdata.loads l
         ON l.id = i.source_load_id
        AND l.operating_company_id = i.operating_company_id
        AND l.soft_deleted_at IS NULL
       WHERE i.operating_company_id = $1::uuid
         AND i.voided_at IS NULL
         AND i.status NOT IN ('void', 'voided', 'draft')
         AND COALESCE(i.source_system, 'tms') = 'tms'
         AND (
           i.source_load_id IS NULL
           OR l.id IS NULL
           OR l.status <> ALL($2::mdata.load_status_enum[])
         )
       ORDER BY i.display_id
       LIMIT 25`,
      [USMCA_OPCO, DELIVERED_STATUSES]
    );

    await client.query("COMMIT");

    const observed = {
      delivered_loads: loadsRes.rows[0]?.n ?? 0,
      active_tms_invoices: invoicesRes.rows[0]?.n ?? 0,
      delivered_load_invoice_orphans: loadOrphansRes.rows.length,
      invoice_without_delivered_load: invoiceOrphansRes.rows.length,
    };
    console.log(`TIEOUT OBSERVED: ${JSON.stringify(observed)}`);

    const diffs = [];
    if (loadOrphansRes.rows.length > 0) {
      diffs.push(
        `${loadOrphansRes.rows.length} delivered load(s) without invoice: ${loadOrphansRes.rows
          .map((r) => `${r.load_number ?? r.id} (${r.status}, wo=${r.customer_wo_number ?? "—"})`)
          .join("; ")}`
      );
    }
    if (invoiceOrphansRes.rows.length > 0) {
      diffs.push(
        `${invoiceOrphansRes.rows.length} invoice(s) without delivered load: ${invoiceOrphansRes.rows
          .map((r) =>
            r.source_load_id
              ? `${r.display_id} → load ${r.load_number ?? r.source_load_id} status=${r.load_status ?? "missing"}`
              : `${r.display_id} (no source_load_id)`
          )
          .join("; ")}`
      );
    }

    if (diffs.length) {
      fail(`DISP-TIEOUT-01 FAIL (${diffs.length} orphan class(es)):\n  ${diffs.join("\n  ")}`);
    }

    console.log(
      "TIEOUT PASS: every USMCA delivered load has an active TMS invoice and every active TMS invoice ties to a delivered load"
    );
    process.exit(0);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    fail(`DISP-TIEOUT-01 errored: ${e.message}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
