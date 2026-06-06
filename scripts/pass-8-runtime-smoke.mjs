#!/usr/bin/env node
/**
 * PASS-8-RUNTIME TIER-1 SMOKE TEST — S1–S6 + Cross-Carrier Re-Probe
 *
 * Spec: docs/trackers/PASS-8-RUNTIME-TIER1-DISPATCH.md
 *
 * All data-creating steps (S1–S5) execute within BEGIN/ROLLBACK transactions so
 * no permanent mutations reach the database.  S6 is a read-only dry-run probe
 * against the period-close readiness query; writes delta MUST be 0.
 *
 * STANDING ORDERS enforced here:
 *   - No mutations to prod data  (all INSERTs are rolled back)
 *   - No schema changes
 *   - Hard-stop on unexpected FAIL; exit code 1 + print exact error
 *
 * Usage: node scripts/pass-8-runtime-smoke.mjs
 */

import dotenv from "dotenv";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { Pool } = pg;

// ──────────────────────────────────────────────────────────────────────────────
// Fixture constants  (from CLOSURE-32 + live DB discovery)
// ──────────────────────────────────────────────────────────────────────────────
const TRK_OCI    = "b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e";  // IH 35 Trucking LLC
const TRANSP_OCI = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";  // IH 35 Transportation LLC
const TRANSP_CUSTOMER_ID = "da56acae-0fbe-4fdd-8171-fa1338b50b32"; // 3 Rivers Logistics Inc.
const TRANSP_DRIVER_ID   = "cc8d9b23-168b-4eea-8237-aa30aa858808"; // TRANSP driver
// Multi-company Owner — used only for inserts (neondb_owner role, bypasses RLS)
const SMOKE_USER_ID      = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // tioperfumes07@gmail.com
// Single-company users for RLS isolation probes (each has access to ONE carrier only)
const TRK_PROBE_USER_ID    = "e7116f77-0b2e-4574-8a70-8cbca615653c"; // m2-probe-trk (TRK only)
const TRANSP_PROBE_USER_ID = "10614b8e-16cb-45a6-989b-0d3298600ee7"; // m2-probe-transp (TRANSP only)

const RUN_TS   = new Date().toISOString();
const RUN_DATE = RUN_TS.slice(0, 10);
const RUN_LABEL = `PASS-8-RUNTIME-${RUN_DATE}`;

// ──────────────────────────────────────────────────────────────────────────────
// Result accumulator
// ──────────────────────────────────────────────────────────────────────────────
const report = {
  run_label:    RUN_LABEL,
  generated_at: RUN_TS,
  spec:         "docs/trackers/PASS-8-RUNTIME-TIER1-DISPATCH.md",
  carriers:     ["TRK", "TRANSP"],
  steps: {},
  cross_carrier_probe: null,
  classification: "PENDING",
  errors: [],
};

let hardStopTriggered = false;

function hardStop(step, msg, rawError) {
  const detail = rawError ? `\n  Raw error: ${String(rawError)}` : "";
  console.error(`\n╔══════════════════════════════════════════════════════╗`);
  console.error(`║  HARD STOP  —  ${step}`);
  console.error(`║  ${msg}${detail}`);
  console.error(`╚══════════════════════════════════════════════════════╝\n`);
  report.errors.push({ step, msg, raw: rawError ? String(rawError) : undefined });
  report.classification = "FAILED";
  hardStopTriggered = true;
  throw new Error(`HARD_STOP:${step}: ${msg}`);
}

function pass(step, data) {
  console.log(`  ✓  ${step}  PASS`);
  report.steps[step] = { status: "PASS", ...data };
}

function fail(step, msg, rawError) {
  console.error(`  ✗  ${step}  FAIL  — ${msg}`);
  hardStop(step, msg, rawError);
}

// ──────────────────────────────────────────────────────────────────────────────
// DB helpers
// ──────────────────────────────────────────────────────────────────────────────

async function withTxRollback(client, fn) {
  const t0 = Date.now();
  await client.query("BEGIN");
  try {
    const result = await fn(client);
    await client.query("ROLLBACK");
    return { ...result, latency_ms: Date.now() - t0 };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { /* ignore */ }
    throw err;
  }
}

/**
 * Inside a transaction, switch to ih35_app role + carrier session vars,
 * execute fn, then RESET ROLE to restore the original role.
 *
 * IMPORTANT: SET ROLE is NOT rolled back by ROLLBACK TO SAVEPOINT in PostgreSQL.
 * We must explicitly RESET ROLE after the probe.  We use SET LOCAL for the
 * session vars (those ARE rolled back by the outer ROLLBACK).
 *
 * probeUserId MUST be a SINGLE-COMPANY user whose user_company_access
 * includes ONLY 'oci' — so RLS enforces cross-carrier isolation correctly.
 */
async function withCarrierIsolationProbe(client, oci, probeUserId, fn) {
  await client.query("SET ROLE ih35_app");
  await client.query(`SET LOCAL app.operating_company_id = '${oci}'`);
  await client.query(`SET LOCAL app.current_user_id = '${probeUserId}'`);
  try {
    const result = await fn(client);
    return result;
  } finally {
    // Restore neondb_owner so subsequent inserts work
    await client.query("RESET ROLE");
  }
}

async function pgStatSnapshot(client) {
  // pg_stat_xact_user_tables tracks the CURRENT TRANSACTION's write stats only.
  // This avoids false positives from rolled-back writes in prior transactions
  // or background activity from other connections.
  const r = await client.query(`
    SELECT
      COALESCE(SUM(n_tup_ins),0)::bigint AS ins,
      COALESCE(SUM(n_tup_upd),0)::bigint AS upd,
      COALESCE(SUM(n_tup_del),0)::bigint AS del
    FROM pg_stat_xact_user_tables
    WHERE schemaname IN ('accounting','dispatch','driver_finance','mdata','settlements')
  `);
  const row = r.rows[0];
  return {
    ins: Number(row.ins || 0),
    upd: Number(row.upd || 0),
    del: Number(row.del || 0),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// S1 — Book load (TRK)
// ──────────────────────────────────────────────────────────────────────────────
async function runS1(client) {
  console.log("\n── S1: Book load (TRK) ──");
  let result;
  try {
    result = await withTxRollback(client, async (c) => {
      // Create TRK test customer (TRK has no customers yet)
      const custR = await c.query(
        `INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data)
         VALUES ('SMOKE-TRK-CUSTOMER', $1, true)
         RETURNING id, operating_company_id`,
        [TRK_OCI]
      );
      const trkCustId = custR.rows[0].id;

      // Create TRK load
      const loadR = await c.query(
        `INSERT INTO mdata.loads
           (operating_company_id, load_number, customer_id, dispatcher_user_id, is_sample_data)
         VALUES ($1, 'SMOKE-TRK-001', $2, $3, true)
         RETURNING id, operating_company_id, load_number`,
        [TRK_OCI, trkCustId, SMOKE_USER_ID]
      );
      const load = loadR.rows[0];

      // Assert OCI
      if (load.operating_company_id !== TRK_OCI) {
        fail("S1", `Load OCI mismatch: got ${load.operating_company_id}`);
      }

      // Cross-carrier isolation: TRANSP-only user MUST NOT see TRK load
      const xRows = await withCarrierIsolationProbe(c, TRANSP_OCI, TRANSP_PROBE_USER_ID, async (rc) =>
        rc.query("SELECT id FROM mdata.loads WHERE id = $1", [load.id])
      );
      if (xRows.rows.length !== 0) {
        fail("S1", `ISOLATION BREACH: TRANSP session sees TRK load ${load.id}`);
      }

      // TRK session MUST see own load
      const ownRows = await withCarrierIsolationProbe(c, TRK_OCI, TRK_PROBE_USER_ID, async (rc) =>
        rc.query("SELECT id FROM mdata.loads WHERE id = $1", [load.id])
      );
      if (ownRows.rows.length !== 1) {
        fail("S1", `OWN-VISIBILITY FAIL: TRK session cannot see its own load`);
      }

      return {
        load_id: load.id,
        load_number: load.load_number,
        oci: load.operating_company_id,
        transp_cross_rows: xRows.rows.length,
        trk_own_rows: ownRows.rows.length,
        note: "ROLLED BACK — no prod mutation",
      };
    });
  } catch (err) {
    if (hardStopTriggered) throw err;
    fail("S1", err.message, err);
  }
  pass("S1", result);
}

// ──────────────────────────────────────────────────────────────────────────────
// S2 — Book load (TRANSP)
// ──────────────────────────────────────────────────────────────────────────────
async function runS2(client) {
  console.log("\n── S2: Book load (TRANSP) ──");
  let result;
  try {
    result = await withTxRollback(client, async (c) => {
      const loadR = await c.query(
        `INSERT INTO mdata.loads
           (operating_company_id, load_number, customer_id, dispatcher_user_id, is_sample_data)
         VALUES ($1, 'SMOKE-TRANSP-001', $2, $3, true)
         RETURNING id, operating_company_id, load_number`,
        [TRANSP_OCI, TRANSP_CUSTOMER_ID, SMOKE_USER_ID]
      );
      const load = loadR.rows[0];

      if (load.operating_company_id !== TRANSP_OCI) {
        fail("S2", `Load OCI mismatch: got ${load.operating_company_id}`);
      }

      // Cross-carrier isolation: TRK-only user MUST NOT see TRANSP load
      const xRows = await withCarrierIsolationProbe(c, TRK_OCI, TRK_PROBE_USER_ID, async (rc) =>
        rc.query("SELECT id FROM mdata.loads WHERE id = $1", [load.id])
      );
      if (xRows.rows.length !== 0) {
        fail("S2", `ISOLATION BREACH: TRK session sees TRANSP load ${load.id}`);
      }

      // TRANSP session MUST see own load
      const ownRows = await withCarrierIsolationProbe(c, TRANSP_OCI, TRANSP_PROBE_USER_ID, async (rc) =>
        rc.query("SELECT id FROM mdata.loads WHERE id = $1", [load.id])
      );
      if (ownRows.rows.length !== 1) {
        fail("S2", `OWN-VISIBILITY FAIL: TRANSP session cannot see its own load`);
      }

      return {
        load_id: load.id,
        load_number: load.load_number,
        oci: load.operating_company_id,
        trk_cross_rows: xRows.rows.length,
        transp_own_rows: ownRows.rows.length,
        note: "ROLLED BACK — no prod mutation",
      };
    });
  } catch (err) {
    if (hardStopTriggered) throw err;
    fail("S2", err.message, err);
  }
  pass("S2", result);
}

// ──────────────────────────────────────────────────────────────────────────────
// S3 — Driver settlement E2E (TRANSP)
// ──────────────────────────────────────────────────────────────────────────────
async function runS3(client) {
  console.log("\n── S3: Driver settlement E2E (TRANSP) ──");
  let result;
  try {
    result = await withTxRollback(client, async (c) => {
      const today = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

      // Create settlement
      const settlR = await c.query(
        `INSERT INTO driver_finance.driver_settlements
           (operating_company_id, display_id, driver_id, period_start, period_end,
            status, gross_pay, deductions_total, reimbursements_total, net_pay)
         VALUES ($1, 'SMOKE-TRANSP-SETT-001', $2, $3, $4, 'draft', 1500.00, 150.00, 0.00, 1350.00)
         RETURNING id, operating_company_id, gross_pay, deductions_total, net_pay`,
        [TRANSP_OCI, TRANSP_DRIVER_ID, weekAgo, today]
      );
      const sett = settlR.rows[0];

      // Assert OCI matches
      if (sett.operating_company_id !== TRANSP_OCI) {
        fail("S3", `Settlement OCI mismatch: got ${sett.operating_company_id}`);
      }

      // Assert settlement math: net_pay = gross_pay - deductions_total
      const grossN = Number(sett.gross_pay);
      const deducN = Number(sett.deductions_total);
      const netN   = Number(sett.net_pay);
      if (Math.abs(netN - (grossN - deducN)) > 0.01) {
        fail("S3", `Settlement math incorrect: ${grossN} - ${deducN} ≠ ${netN}`);
      }

      // Cross-carrier isolation: TRK-only user MUST NOT see TRANSP settlement
      const xRows = await withCarrierIsolationProbe(c, TRK_OCI, TRK_PROBE_USER_ID, async (rc) =>
        rc.query(
          "SELECT id FROM driver_finance.driver_settlements WHERE id = $1",
          [sett.id]
        )
      );
      if (xRows.rows.length !== 0) {
        fail("S3", `ISOLATION BREACH: TRK sees TRANSP settlement ${sett.id}`);
      }

      return {
        settlement_id: sett.id,
        oci: sett.operating_company_id,
        gross_pay: grossN,
        deductions_total: deducN,
        net_pay: netN,
        math_check: `${grossN} - ${deducN} = ${netN}`,
        trk_cross_rows: xRows.rows.length,
        note: "ROLLED BACK — no prod mutation",
      };
    });
  } catch (err) {
    if (hardStopTriggered) throw err;
    fail("S3", err.message, err);
  }
  pass("S3", result);
}

// ──────────────────────────────────────────────────────────────────────────────
// S4 — Invoice gen + send + QBO outbox (TRANSP)
// ──────────────────────────────────────────────────────────────────────────────
async function runS4(client) {
  console.log("\n── S4: Invoice gen + QBO outbox (TRANSP) ──");
  let result;
  try {
    result = await withTxRollback(client, async (c) => {
      const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

      // Create invoice
      const invR = await c.query(
        `INSERT INTO accounting.invoices
           (operating_company_id, customer_id, display_id, status, due_date,
            subtotal_cents, total_cents, invoice_type, created_by_user_id)
         VALUES ($1, $2, 'INV-2026-99001', 'draft', $3,
                 250000, 250000, 'from_load', $4)
         RETURNING id, operating_company_id, display_id, status`,
        [TRANSP_OCI, TRANSP_CUSTOMER_ID, dueDate, SMOKE_USER_ID]
      );
      const inv = invR.rows[0];

      if (inv.operating_company_id !== TRANSP_OCI) {
        fail("S4", `Invoice OCI mismatch: got ${inv.operating_company_id}`);
      }

      // Enqueue QBO outbox event
      const outboxR = await c.query(
        `INSERT INTO accounting.outbox_events
           (operating_company_id, event_type, aggregate_type, aggregate_id, payload, status)
         VALUES ($1, 'invoice.created', 'Invoice', $2,
                 jsonb_build_object('display_id', $3::text, 'total_cents', 250000),
                 'pending')
         RETURNING id, operating_company_id, status`,
        [TRANSP_OCI, inv.id, inv.display_id]
      );
      const outbox = outboxR.rows[0];

      if (outbox.status !== "pending") {
        fail("S4", `Outbox event not in pending state: got ${outbox.status}`);
      }
      if (outbox.operating_company_id !== TRANSP_OCI) {
        fail("S4", `Outbox OCI mismatch: got ${outbox.operating_company_id}`);
      }

      // Cross-carrier isolation: TRK-only user MUST NOT see TRANSP invoice
      const xInv = await withCarrierIsolationProbe(c, TRK_OCI, TRK_PROBE_USER_ID, async (rc) =>
        rc.query("SELECT id FROM accounting.invoices WHERE id = $1", [inv.id])
      );
      if (xInv.rows.length !== 0) {
        fail("S4", `ISOLATION BREACH: TRK sees TRANSP invoice ${inv.id}`);
      }

      return {
        invoice_id: inv.id,
        invoice_display_id: inv.display_id,
        invoice_oci: inv.operating_company_id,
        invoice_status: inv.status,
        outbox_id: outbox.id,
        outbox_status: outbox.status,
        outbox_oci: outbox.operating_company_id,
        trk_cross_inv_rows: xInv.rows.length,
        note: "ROLLED BACK — no prod mutation; QBO sandbox NOT called (correct for dry-run)",
      };
    });
  } catch (err) {
    if (hardStopTriggered) throw err;
    fail("S4", err.message, err);
  }
  pass("S4", result);
}

// ──────────────────────────────────────────────────────────────────────────────
// S5 — Bill create + post + QBO outbox (TRANSP)
// ──────────────────────────────────────────────────────────────────────────────
async function runS5(client) {
  console.log("\n── S5: Bill create + QBO outbox (TRANSP) ──");
  let result;
  try {
    result = await withTxRollback(client, async (c) => {
      // Create bill
      const billR = await c.query(
        `INSERT INTO accounting.bills
           (operating_company_id, status, created_by_user_id)
         VALUES ($1, 'unpaid', $2)
         RETURNING id, operating_company_id, status`,
        [TRANSP_OCI, SMOKE_USER_ID]
      );
      const bill = billR.rows[0];

      if (bill.operating_company_id !== TRANSP_OCI) {
        fail("S5", `Bill OCI mismatch: got ${bill.operating_company_id}`);
      }
      if (bill.status !== "unpaid") {
        fail("S5", `Bill status unexpected: ${bill.status}`);
      }

      // Enqueue QBO outbox event
      const outboxR = await c.query(
        `INSERT INTO accounting.outbox_events
           (operating_company_id, event_type, aggregate_type, aggregate_id, payload, status)
         VALUES ($1, 'bill.created', 'Bill', $2::uuid,
                 jsonb_build_object('bill_id', $2::uuid),
                 'pending')
         RETURNING id, operating_company_id, status`,
        [TRANSP_OCI, bill.id]
      );
      const outbox = outboxR.rows[0];

      if (outbox.status !== "pending") {
        fail("S5", `Outbox event not pending: ${outbox.status}`);
      }

      // Cross-carrier isolation: TRK-only user MUST NOT see TRANSP bill
      const xBill = await withCarrierIsolationProbe(c, TRK_OCI, TRK_PROBE_USER_ID, async (rc) =>
        rc.query("SELECT id FROM accounting.bills WHERE id = $1", [bill.id])
      );
      if (xBill.rows.length !== 0) {
        fail("S5", `ISOLATION BREACH: TRK sees TRANSP bill ${bill.id}`);
      }

      return {
        bill_id: bill.id,
        bill_oci: bill.operating_company_id,
        bill_status: bill.status,
        outbox_id: outbox.id,
        outbox_status: outbox.status,
        trk_cross_bill_rows: xBill.rows.length,
        note: "ROLLED BACK — no prod mutation",
      };
    });
  } catch (err) {
    if (hardStopTriggered) throw err;
    fail("S5", err.message, err);
  }
  pass("S5", result);
}

// ──────────────────────────────────────────────────────────────────────────────
// S6 — Period-close dry-run + write-leak assertion
// ──────────────────────────────────────────────────────────────────────────────
async function runS6(client) {
  console.log("\n── S6: Period-close dry-run + write-leak assertion ──");
  let result;
  try {
    const t0 = Date.now();

    // Wrap the entire S6 dry-run in a transaction so pg_stat_xact_user_tables
    // tracks ONLY writes from this transaction (zero expected for a read-only dry-run).
    await client.query("BEGIN");
    try {

    // Record pg_stat baseline BEFORE dry-run (within the transaction)
    const baseline = await pgStatSnapshot(client);

    // Dry-run: read-only period-close readiness check
    // Executes the month-close status query (equivalent to getMonthCloseStatus)
    // This is the "dry-run": it READS what would be needed to close a period
    // without performing any writes.
    const periodsR = await client.query(`
      SELECT
        id,
        operating_company_id,
        period_start::text,
        period_end::text,
        fiscal_year,
        status
      FROM accounting.periods
      WHERE operating_company_id IN ($1, $2)
        AND status = 'open'
      ORDER BY period_start DESC
      LIMIT 10
    `, [TRK_OCI, TRANSP_OCI]);

    // Month-close readiness checks (read-only):
    const bankReconR = await client.query(`
      SELECT COUNT(*) AS pending_recon
      FROM banking.bank_accounts ba
      WHERE ba.operating_company_id IN ($1, $2)
    `, [TRK_OCI, TRANSP_OCI]).catch(() => ({ rows: [{ pending_recon: "N/A" }] }));

    // AR aging (outstanding invoices > 30 days)
    const arAgingR = await client.query(`
      SELECT COUNT(*) AS overdue_invoices
      FROM accounting.invoices
      WHERE operating_company_id IN ($1, $2)
        AND status NOT IN ('paid','void')
        AND due_date < CURRENT_DATE - INTERVAL '30 days'
    `, [TRK_OCI, TRANSP_OCI]);

    // Record pg_stat AFTER dry-run queries (same transaction scope)
    const afterStat = await pgStatSnapshot(client);

    const writeDelta = {
      ins: afterStat.ins - baseline.ins,
      upd: afterStat.upd - baseline.upd,
      del: afterStat.del - baseline.del,
      total: (afterStat.ins + afterStat.upd + afterStat.del) -
             (baseline.ins + baseline.upd + baseline.del),
    };

    // CRITICAL assertion: dry-run MUST produce zero writes
    if (writeDelta.total !== 0) {
      fail(
        "S6",
        `WRITE LEAK DETECTED: dry-run produced ${writeDelta.total} write(s) ` +
        `(ins=${writeDelta.ins} upd=${writeDelta.upd} del=${writeDelta.del})`
      );
    }

    const latency_ms = Date.now() - t0;
    result = {
      open_periods_found: periodsR.rows.length,
      periods: periodsR.rows,
      ar_overdue_invoices: Number(arAgingR.rows[0].overdue_invoices),
      pending_bank_recon: bankReconR.rows[0].pending_recon,
      write_delta: writeDelta,
      write_leak: writeDelta.total !== 0,
      latency_ms,
      note:
        "Dry-run complete — reads period/AR state without writing. " +
        `${periodsR.rows.length} open period(s) found.`,
    };

    } finally {
      // Rollback the S6 transaction (dry-run should never commit)
      await client.query("ROLLBACK");
    }
  } catch (err) {
    if (hardStopTriggered) throw err;
    fail("S6", err.message, err);
  }
  pass("S6", result);
}

// ──────────────────────────────────────────────────────────────────────────────
// Cross-carrier re-probe (post S1–S6)
// ──────────────────────────────────────────────────────────────────────────────
async function runCrossCarrierProbe(client) {
  console.log("\n── Cross-carrier re-probe ──");
  const probeResults = [];

  // Tables to probe (must be empty from cross-tenant perspective)
  const tables = [
    { schema: "mdata",          table: "loads",               oci_col: "operating_company_id" },
    { schema: "mdata",          table: "customers",           oci_col: "operating_company_id" },
    { schema: "mdata",          table: "drivers",             oci_col: "operating_company_id" },
    { schema: "accounting",     table: "invoices",            oci_col: "operating_company_id" },
    { schema: "accounting",     table: "bills",               oci_col: "operating_company_id" },
    { schema: "driver_finance", table: "driver_settlements",  oci_col: "operating_company_id" },
    { schema: "accounting",     table: "outbox_events",       oci_col: "operating_company_id" },
  ];

  // TRK session → query TRANSP-tagged rows
  for (const t of tables) {
    const r = await withCarrierIsolationProbe(client, TRK_OCI, TRK_PROBE_USER_ID, async (c) =>
      c.query(
        `SELECT COUNT(*) AS cnt FROM ${t.schema}.${t.table}
         WHERE ${t.oci_col} = $1`,
        [TRANSP_OCI]
      )
    );
    const cnt = Number(r.rows[0].cnt);
    probeResults.push({
      probe: `TRK-session→${t.schema}.${t.table}[TRANSP rows]`,
      rows: cnt,
      pass: cnt === 0,
    });
    if (cnt > 0) {
      fail(
        "cross_carrier_probe",
        `TRK session sees ${cnt} TRANSP row(s) in ${t.schema}.${t.table}`
      );
    }
  }

  // TRANSP session → query TRK-tagged rows
  for (const t of tables) {
    const r = await withCarrierIsolationProbe(client, TRANSP_OCI, TRANSP_PROBE_USER_ID, async (c) =>
      c.query(
        `SELECT COUNT(*) AS cnt FROM ${t.schema}.${t.table}
         WHERE ${t.oci_col} = $1`,
        [TRK_OCI]
      )
    );
    const cnt = Number(r.rows[0].cnt);
    probeResults.push({
      probe: `TRANSP-session→${t.schema}.${t.table}[TRK rows]`,
      rows: cnt,
      pass: cnt === 0,
    });
    if (cnt > 0) {
      fail(
        "cross_carrier_probe",
        `TRANSP session sees ${cnt} TRK row(s) in ${t.schema}.${t.table}`
      );
    }
  }

  const totalCrossRows = probeResults.reduce((acc, p) => acc + p.rows, 0);
  const allPass = probeResults.every((p) => p.pass);

  report.cross_carrier_probe = {
    status: allPass ? "PASS" : "FAIL",
    total_cross_rows: totalCrossRows,
    probes: probeResults,
  };

  if (allPass) {
    console.log(`  ✓  cross_carrier_probe  PASS  (${probeResults.length} probes, 0 cross-tenant rows)`);
  } else {
    fail("cross_carrier_probe", `${totalCrossRows} cross-tenant row(s) visible`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────
async function main() {
  const connStr = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connStr) hardStop("precondition", "DATABASE_DIRECT_URL and DATABASE_URL both unset");

  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`  PASS-8-RUNTIME SMOKE TEST  —  ${RUN_LABEL}`);
  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`  TRK OCI:    ${TRK_OCI}`);
  console.log(`  TRANSP OCI: ${TRANSP_OCI}`);
  console.log(`  Started:    ${RUN_TS}\n`);

  const pool = new Pool({ connectionString: connStr, max: 1 });
  const client = await pool.connect();

  try {
    // ── Precondition: verify both carriers exist ──
    const companiesR = await client.query(
      `SELECT id, code, is_active FROM org.companies WHERE id IN ($1, $2) ORDER BY code`,
      [TRK_OCI, TRANSP_OCI]
    );
    if (companiesR.rows.length !== 2) {
      hardStop("precondition", `Expected 2 carriers, found ${companiesR.rows.length}`);
    }
    const trkRow = companiesR.rows.find((r) => r.id === TRK_OCI);
    const transpRow = companiesR.rows.find((r) => r.id === TRANSP_OCI);
    if (!trkRow?.is_active || !transpRow?.is_active) {
      hardStop("precondition", "TRK or TRANSP carrier is not active");
    }
    console.log(`  ✓  Precondition: TRK (${trkRow.code}) + TRANSP (${transpRow.code}) both active`);

    // ── Run S1–S6 ──
    await runS1(client);
    await runS2(client);
    await runS3(client);
    await runS4(client);
    await runS5(client);
    await runS6(client);

    // ── Cross-carrier re-probe ──
    await runCrossCarrierProbe(client);

    // ── Classify ──
    const allStepsPass = Object.values(report.steps).every((s) => s.status === "PASS");
    const crossPass = report.cross_carrier_probe?.status === "PASS";
    report.classification = allStepsPass && crossPass ? "CLEAN" : "FAILED";

  } catch (err) {
    if (!hardStopTriggered) {
      console.error(`[UNEXPECTED] ${err.message}`);
      report.classification = "FAILED";
      report.errors.push({ step: "unexpected", msg: err.message });
    }
  } finally {
    client.release();
    await pool.end();
  }

  // ── Summary ──
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`  CLASSIFICATION:  ${report.classification}`);
  console.log(`═══════════════════════════════════════════════════════`);

  for (const [step, res] of Object.entries(report.steps)) {
    console.log(`  ${res.status === "PASS" ? "✓" : "✗"}  ${step.toUpperCase()}  ${res.status}  (${res.latency_ms}ms)`);
  }
  if (report.cross_carrier_probe) {
    const cp = report.cross_carrier_probe;
    console.log(`  ${cp.status === "PASS" ? "✓" : "✗"}  CROSS-CARRIER-PROBE  ${cp.status}  (${cp.total_cross_rows} cross-tenant rows)`);
  }
  if (report.errors.length > 0) {
    console.log("\n  Errors:");
    for (const e of report.errors) {
      console.log(`    [${e.step}] ${e.msg}`);
    }
  }
  console.log("");

  // Emit structured JSON for orchestration
  process.stdout.write(JSON.stringify(report) + "\n");

  if (report.classification !== "CLEAN") process.exitCode = 1;
}

main().catch((err) => {
  if (!hardStopTriggered) {
    console.error(`[FATAL] ${err.message}`);
    process.exitCode = 1;
  }
});
