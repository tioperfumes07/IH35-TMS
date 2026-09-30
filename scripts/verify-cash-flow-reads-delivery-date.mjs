#!/usr/bin/env node
// ROUND 177 JOB 3 (Lead, P0): "Guard that cash flow reads the delivery date. All 16 invoices have
// issue_date = due_date = delivery. Confirm 13635/13637 (10-01) and 13630/13634 (09-30) land in the
// right period."
//
// ROUND 241 CORRECTION (Lead, 2026-09-29, P0): this guard's original rule --
// issue_date = due_date = delivery_date, unconditionally, for every one of the 16 batch loads --
// was WRONG. It happened to hold for 15 of the 16 only because those 15 loads' customers carry NO
// payment terms on file (payment_terms_days IS NULL). Load 13638's customer
// (04b65d8b-a1a3-4580-9224-d0f16b0946f5) has REAL Net-30 terms -- measured live, 17/17 of that
// customer's invoices over two months are Net-30, none ever due on delivery. Its due_date of
// 2026-10-28 (delivery 09-28 + 30 days) is CORRECT, not a defect. A seat (Claude-1) nearly wrote a
// "fix" that would have understated a live receivable's aging by 30 days and been silently
// re-broken the next time anything recomputed from payment_terms_days=30 (the row would still say
// Net-30 while due_date said otherwise -- internally contradictory, a fix that re-breaks is not a
// fix). The write was correctly refused (accounting.invoices is ROUND 219 freeze-locked and this
// was never one of the three authorized writes) before it happened.
//
// THE REAL RULE, asserted below per invoice, not as a blanket batch equality:
//   issue_date  = delivery_date  (always -- mint-time stamps issue_date from the real delivery, no
//                                  exceptions; this half of the original rule was always right)
//   due_date    = delivery_date + COALESCE(payment_terms_days, 0)  (respects real customer terms
//                                  when they exist; equals delivery_date when they don't)
//
// SCOPE: this batch, loads 13624-13639, minted under the delivery-date-invoicing cutover -- issue_date
// = delivery_date still applies to all of them (never net-30'd on the issue side). Historical
// invoices predate that cutover and are out of scope here (unchanged from the original guard).
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

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";
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

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function selftest() {
  const { getRollingLedgerRows } = await import("../apps/backend/src/cash-flow/cash-flow.service.ts");
  const failures = [];
  if (typeof getRollingLedgerRows !== "function") failures.push("getRollingLedgerRows did not import as a function");
  if (Object.keys(PINNED_DATES).length !== 4) failures.push("expected exactly 4 pinned loads");
  if (!BATCH_LOAD_NUMBERS.includes("13635")) failures.push("batch list missing an expected load");

  // ROUND 241: the real rule must respect real customer terms, not force delivery=due for everyone.
  if (addDays("2026-09-28", 0) !== "2026-09-28") failures.push("addDays(0) must be a no-op");
  if (addDays("2026-09-28", 30) !== "2026-10-28") failures.push("addDays(30) must match load 13638's real Net-30 case exactly");
  // A row like 13638 (terms=30, delivery=due-30) must NOT be flagged as a violation by the real rule.
  const termsRow = { load_number: "13638", issue_date: "2026-09-28", due_date: "2026-10-28", delivery_date: "2026-09-28", payment_terms_days: 30 };
  const zeroTermsRow = { load_number: "13624", issue_date: "2026-09-28", due_date: "2026-09-28", delivery_date: "2026-09-28", payment_terms_days: null };
  for (const [label, row] of [["terms row", termsRow], ["zero-terms row", zeroTermsRow]]) {
    const expected = addDays(row.delivery_date, Number(row.payment_terms_days ?? 0));
    if (row.due_date !== expected) failures.push(`selftest fixture wrong: ${label} due_date should equal delivery_date+terms`);
  }
  // The OLD (ROUND 241-superseded) rule would have wrongly flagged the terms row -- prove the new
  // rule does not, by construction: issue_date===delivery_date holds for BOTH, and due_date is
  // checked against delivery+terms, never against a blanket delivery_date-only equality.
  if (termsRow.due_date === termsRow.delivery_date) failures.push("selftest fixture invalid: terms row must NOT have due_date===delivery_date (that was the bug this round fixed)");

  // ROUND 300 H-3 lane-cross correction: an undelivered load ('dispatched') with no invoice is
  // CORRECT (revenue-at-delivery), not a failure; only a delivered-enough load with no invoice is.
  const DELIVERED_ENOUGH_STATUSES_TEST = new Set(["completed_docs_received", "invoiced", "closed"]);
  if (DELIVERED_ENOUGH_STATUSES_TEST.has("dispatched")) {
    failures.push("selftest: 'dispatched' must NOT be treated as delivered-enough to require an invoice");
  }
  if (!DELIVERED_ENOUGH_STATUSES_TEST.has("invoiced")) {
    failures.push("selftest: 'invoiced' must be treated as delivered-enough to require an invoice");
  }

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
    // ROUND 241 (CC-3 finding, folded in here since this is the same file): `SET LOCAL ROLE
    // neondb_owner` fails "permission denied to set role" against Neon's pooled endpoint even
    // when already connected AS neondb_owner (pooler role-switching, same class as BANK-F30150 in
    // verify-alwaystrack-parity.mjs). The correct, working pattern used by every other live guard
    // in this repo is set_config('app.bypass_rls','lucia',true) inside one explicit transaction.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const invRes = await client.query(
      `SELECT l.load_number, i.status::text, i.issue_date::text, i.due_date::text,
              i.payment_terms_days,
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

    // ROUND 300 H-3 lane-cross correction: the original "every one of the 16 batch loads must have
    // a non-void invoice" check fired unconditionally, regardless of whether the load had actually
    // delivered. Revenue-at-delivery is a LOCKED decision (docs memory: revenue is recognized at
    // delivery, never before) -- a load still in 'dispatched' has not delivered and MUST NOT have an
    // invoice yet; flagging that as "missing" is the guard demanding a violation of the very law it
    // is supposed to protect. Only a load whose own status shows it has actually reached delivery
    // (completed_docs_received / invoiced / closed) is required to carry an invoice.
    const DELIVERED_ENOUGH_STATUSES = new Set(["completed_docs_received", "invoiced", "closed"]);
    const statusRes = await client.query(
      `SELECT load_number, status::text FROM mdata.loads
        WHERE operating_company_id = $1::uuid AND load_number = ANY($2::text[])`,
      [USMCA, BATCH_LOAD_NUMBERS]
    );
    const loadStatusByNumber = new Map(statusRes.rows.map((r) => [r.load_number, r.status]));

    const today = new Date().toISOString().slice(0, 10);
    const rows = await getRollingLedgerRows(client, USMCA, today);
    await client.query("ROLLBACK");

    const failures = [];
    const foundLoads = new Set();
    for (const r of invRes.rows) {
      foundLoads.add(r.load_number);
      const termsDays = Number(r.payment_terms_days ?? 0);
      const expectedDueDate = addDays(r.delivery_date, termsDays);
      if (r.issue_date !== r.delivery_date) {
        failures.push(
          `load ${r.load_number}: issue_date=${r.issue_date} != delivery_date=${r.delivery_date} — issue_date must always equal delivery_date`
        );
      }
      if (r.due_date !== expectedDueDate) {
        failures.push(
          `load ${r.load_number}: due_date=${r.due_date}, expected delivery_date(${r.delivery_date}) + payment_terms_days(${r.payment_terms_days ?? "NULL->0"}) = ${expectedDueDate}`
        );
      }
    }
    for (const n of BATCH_LOAD_NUMBERS) {
      if (foundLoads.has(n)) continue;
      const loadStatus = loadStatusByNumber.get(n);
      if (DELIVERED_ENOUGH_STATUSES.has(loadStatus)) {
        failures.push(`load ${n}: status=${loadStatus} (delivered) but no non-void invoice found at all`);
      }
      // else: not yet delivered (e.g. 'dispatched') -- correctly has no invoice yet, per
      // revenue-at-delivery. Not a failure.
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
    const deliveredCount = BATCH_LOAD_NUMBERS.filter((n) => DELIVERED_ENOUGH_STATUSES.has(loadStatusByNumber.get(n))).length;
    console.log(
      `${LABEL}: PASS — every invoice that DOES exist among the ${BATCH_LOAD_NUMBERS.length} batch loads has issue_date=delivery_date and due_date=delivery_date+payment_terms_days (real per-customer terms respected, ROUND 241); ` +
        `${deliveredCount} of ${BATCH_LOAD_NUMBERS.length} loads have reached a delivered-enough status and all of those carry a non-void invoice — the rest are still in transit and correctly have none yet (revenue-at-delivery). ` +
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
