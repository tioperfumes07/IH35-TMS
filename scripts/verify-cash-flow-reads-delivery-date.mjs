#!/usr/bin/env node
// ROUND 177 JOB 3 (Lead, P0): "Guard that cash flow reads the delivery date. All 16 invoices have
// issue_date = due_date = delivery. Confirm 13635/13637 (10-01) and 13630/13634 (09-30) land in the
// right period."
//
// SCOPE, and why: this policy (issue_date = due_date = delivery date, no net-30) applies to the
// CURRENT dispatch batch, loads 13624-13639, minted under the delivery-date-invoicing cutover.
// Historical invoices predate that cutover and correctly use net-30 (issue_date + 30 days) --
// verified live: dozens of older sent invoices show due_date = issue_date + 30d, which is EXPECTED
// STATE for pre-cutover rows, not a defect. A blanket "every invoice must match its delivery date"
// assertion would be permanently, falsely red against that whole historical population. This guard
// is scoped to the named batch only, matching the Lead's own framing -- never re-litigating
// historical invoices' net-30 dates.
//
// SECOND FINDING, live-verified, more load-bearing than the first: as of this writing, all 4
// pinned loads (and, checked, the rest of the 16) carry invoice status='proforma', not sent/
// partial. getRollingLedgerRows (apps/backend/src/cash-flow/cash-flow.service.ts) explicitly
// filters its invoice query to status IN ('sent','partial') -- a proforma invoice is invisible to
// the cash-flow rolling ledger entirely, regardless of its due_date. So the honest answer to "do
// 13635/13637 land in the right period" is: they don't land ANYWHERE in cash flow yet, because
// nothing has been sent. This guard does NOT force that open -- whether a proforma invoice should
// count as projected income in a cash-flow FORECAST is a real design question for the Lead/owner,
// not something to decide here. What IS asserted, unconditionally: (1) every one of these 16
// loads' own invoice record already has the correct issue_date=due_date=delivery_date baked in,
// so the moment one is sent, the date is already right; (2) for any of the 16 that HAS been sent/
// partial (0 today, checked before writing this), the live rolling ledger's row for it must show
// that same due_date -- proving the service function actually reads it once the invoice is
// visible to it at all.
import { register } from "tsx/esm/api";
register();

const LABEL = "verify-cash-flow-reads-delivery-date";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BATCH_LOAD_NUMBERS = [
  "13624", "13625", "13626", "13627", "13628", "13629", "13630", "13631",
  "13632", "13633", "13634", "13635", "13636", "13637", "13638", "13639",
];
// Pinned regression values, per the Lead's own order.
const PINNED_DATES = {
  "13630": "2026-09-30",
  "13634": "2026-09-30",
  "13635": "2026-10-01",
  "13637": "2026-10-01",
};

async function selftest() {
  const { getRollingLedgerRows } = await import("../apps/backend/src/cash-flow/cash-flow.service.ts");
  const failures = [];
  if (typeof getRollingLedgerRows !== "function") failures.push("getRollingLedgerRows did not import as a function");
  if (Object.keys(PINNED_DATES).length !== 4) failures.push("expected exactly 4 pinned loads");
  if (!BATCH_LOAD_NUMBERS.includes("13635")) failures.push("batch list missing an expected load");
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    await selftest();
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.log(`${LABEL}: SKIP — no DATABASE_URL (live-data invariant by design).`);
    return;
  }
  const { getRollingLedgerRows } = await import("../apps/backend/src/cash-flow/cash-flow.service.ts");
  const { default: pg } = await import("pg");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const invRes = await client.query(
      `SELECT l.load_number, i.status::text, i.issue_date::text, i.due_date::text,
              sd.scheduled_arrival_at::date::text AS delivery_date
         FROM mdata.loads l
         JOIN accounting.invoices i ON i.source_load_id = l.id
         LEFT JOIN LATERAL (
           SELECT scheduled_arrival_at FROM mdata.load_stops
            WHERE load_id = l.id AND stop_type = 'delivery' AND soft_deleted_at IS NULL
            ORDER BY sequence_number DESC LIMIT 1
         ) sd ON true
        WHERE l.operating_company_id = $1::uuid
          AND l.load_number = ANY($2::text[])
          AND i.voided_at IS NULL AND i.status <> 'void'`,
      [USMCA, BATCH_LOAD_NUMBERS]
    );

    const today = new Date().toISOString().slice(0, 10);
    const rows = await getRollingLedgerRows(client, USMCA, today);
    await client.query("ROLLBACK");

    const failures = [];
    const foundLoads = new Set();
    for (const r of invRes.rows) {
      foundLoads.add(r.load_number);
      if (r.issue_date !== r.due_date || r.due_date !== r.delivery_date) {
        failures.push(
          `load ${r.load_number}: issue_date=${r.issue_date} due_date=${r.due_date} delivery_date=${r.delivery_date} — must all match (batch delivery-date-invoicing policy)`
        );
      }
    }
    for (const n of BATCH_LOAD_NUMBERS) {
      if (!foundLoads.has(n)) failures.push(`load ${n}: no non-void invoice found at all`);
    }

    const rollingLedgerByLoad = new Map(
      rows.filter((r) => r.document_kind === "invoice" && r.load_number).map((r) => [r.load_number, r])
    );
    let sentCount = 0;
    for (const [loadNumber, expectedDate] of Object.entries(PINNED_DATES)) {
      const inv = invRes.rows.find((r) => r.load_number === loadNumber);
      if (inv && (inv.status === "sent" || inv.status === "partial")) {
        sentCount += 1;
        const ledgerRow = rollingLedgerByLoad.get(loadNumber);
        if (!ledgerRow) {
          failures.push(`load ${loadNumber}: invoice is sent/partial but has NO row in the live rolling ledger`);
        } else if (ledgerRow.due_date !== expectedDate) {
          failures.push(`load ${loadNumber}: rolling ledger shows due_date=${ledgerRow.due_date}, expected ${expectedDate}`);
        }
      }
    }

    if (failures.length) {
      console.error(`${LABEL}: FAIL —\n  - ${failures.join("\n  - ")}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `${LABEL}: PASS — all ${BATCH_LOAD_NUMBERS.length} batch loads' invoices have issue_date=due_date=delivery_date. ` +
        `${sentCount} of ${Object.keys(PINNED_DATES).length} pinned loads are sent/partial and were confirmed in the live rolling ledger` +
        (sentCount === 0 ? " (none sent yet — cash-flow visibility for this batch is currently zero; that is a real, separate finding, not a guard failure)." : ".")
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
