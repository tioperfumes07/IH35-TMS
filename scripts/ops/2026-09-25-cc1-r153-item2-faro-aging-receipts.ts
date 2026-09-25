/**
 * ROUND 153 item 2 — post the 6 real customer receipts Faro's own AGING REPORT.csv proves already
 * happened, so each factored invoice's open balance ties to Faro AGING to the cent and the factored
 * open total equals $298,762.00 (Lead order, 2026-09-25 3:38 AM CT / 08:38Z).
 *
 * SOURCE (owner's local files, read directly, never re-typed by hand):
 *   ~/Downloads/AGING REPORT.csv                                          (Faro's live AR aging)
 *   ~/Downloads/IH35-RECONCILIATION-AND-FEED/06-OUTPUT/faro_reconciliation_register.csv
 *                                                                         (faro_inv -> tms_load map)
 *
 * DERIVATION (verified against both files, not guessed):
 *   sum(AGING.Balance) over all 82 open rows = $298,762.00 exactly (matches the Lead's own target).
 *   register has 89 rows (face $311,587.00, matching the already-known 89-advance figure). Of those,
 *   6 do NOT appear in AGING at all -> Faro's own book shows them fully collected/closed (AGING never
 *   carries a $0 row; a closed invoice simply drops off it). One of the 6 (Faro inv 7, ITS LOGISTICS,
 *   $350.00) has no TMS load at all ("no TMS load carries this line haul" per the register's own
 *   note) -- there is nothing on our side to post a receipt against, so it is reported as a gap, not
 *   invented. The other 5 map cleanly to a live TMS invoice, confirmed live before writing anything:
 *   invoice.total_cents equals the register's purchase amount to the cent for every one of the 6
 *   (see the FULL_RECEIPT / PARTIAL_RECEIPT tables below) -- proof the mapping is right, not assumed.
 *   One further register row (inv 14, load 13521) IS still in AGING but at a PARTIAL balance ($250.00
 *   against a $3,500.00 purchase) -- a $3,250.00 receipt already landed against it.
 *   Total: 5 * full-close + 1 partial = $12,475.00 postable on our books + the $350.00 unreachable
 *   gap (inv 7) = $12,825.00, matching the Lead's own "receipts 12,825.00, 6 invoices closed" figure
 *   exactly. This is the full reconciliation, not a plug: every dollar is named to its own invoice.
 *
 * DATE: neither source file carries the debtor's own remittance date (PAYMENTS TO USMCA FROM
 * FARO.csv only records Faro's advance wires TO us, a different cash flow already booked separately
 * as the 89 factoring advances -- confirmed live: those Wire rows track ~97% of "purchase" regardless
 * of the invoice's AGING balance, i.e. they fire at FACTORING time, not at debtor-collection time).
 * AGING REPORT.csv's own snapshot date is recoverable and consistent across every row (InvDate + Age
 * lands on 2026-09-21 for row after row) -- that is Faro's own report date, the one date this data
 * actually proves the debtor had already paid by. Used for all 6 receipts: "dated as Faro dates it"
 * per the Lead's order, using the one date Faro's own document actually carries.
 *
 * WRITER: the existing customer-payment engine, exactly as customer-payments.routes.ts calls it --
 * accounting.payments created with the same columns as that route's own INSERT, then
 * apps/backend/src/accounting/payments/apply.service.ts's applyPayment() (the real, shared
 * application + GL-posting engine; CUSTOMER_PAYMENT_GL_POSTING_ENABLED confirmed live ON for USMCA).
 * No new engine. Idempotent: re-running this script skips any invoice whose live open balance
 * already matches its target (see ensureNotAlreadyApplied below).
 */
import pg from "pg";
import { spawnSync } from "node:child_process";

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";
// Faro AGING REPORT.csv's own snapshot date (derived: InvDate + Age is constant across rows).
const FARO_AGING_AS_OF = "2026-09-21";

type Receipt = {
  faro_inv: string;
  load_number: string;
  receipt_cents: number;
  note: string;
};

// 5 full closes (invoice absent from AGING = fully collected on Faro's book) + 1 partial (invoice
// 14/load 13521, AGING balance $250.00 against a $3,500.00 purchase => $3,250.00 already collected).
const RECEIPTS: Receipt[] = [
  { faro_inv: "3", load_number: "13508", receipt_cents: 250000, note: "Faro AGING: invoice fully closed (absent from AGING REPORT.csv)" },
  { faro_inv: "4", load_number: "13512", receipt_cents: 170000, note: "Faro AGING: invoice fully closed (absent from AGING REPORT.csv)" },
  { faro_inv: "8", load_number: "13515", receipt_cents: 52500, note: "Faro AGING: invoice fully closed (absent from AGING REPORT.csv)" },
  { faro_inv: "11", load_number: "13516", receipt_cents: 70000, note: "Faro AGING: invoice fully closed (absent from AGING REPORT.csv)" },
  { faro_inv: "16", load_number: "13524", receipt_cents: 380000, note: "Faro AGING: invoice fully closed (absent from AGING REPORT.csv)" },
  { faro_inv: "14", load_number: "13521", receipt_cents: 325000, note: "Faro AGING: partial receipt, $250.00 remains open per AGING REPORT.csv" },
];

// Faro inv 7 (ITS LOGISTICS, $350.00) is closed on Faro's own book but carries NO tms_load in the
// register ("no TMS load carries this line haul") -- there is no TMS invoice to post a receipt
// against. Reported, never invented. This is the $12,475 (postable) vs $12,825 (Faro's own total)
// gap named in this file's own header.
const UNREACHABLE_GAP = { faro_inv: "7", debtor: "ITS LOGISTICS, LLC", purchase_cents: 35000 };

async function main() {
  const authId = process.env.OWNER_AUTH_ID;
  if (!authId) {
    throw new Error("OWNER_AUTH_ID is required; refusing a production financial write without an OPEN authorization on main");
  }
  const authCheck = spawnSync("node", ["scripts/verify-owner-authorization.mjs", authId], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (authCheck.status !== 0) {
    throw new Error(`verify-owner-authorization.mjs rejected ${authId}`);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA_ID]);

    console.log(`UNREACHABLE GAP (report only, not posted): Faro inv ${UNREACHABLE_GAP.faro_inv} ${UNREACHABLE_GAP.debtor} $${(UNREACHABLE_GAP.purchase_cents / 100).toFixed(2)} -- no TMS load/invoice exists for this Faro line.`);

    // Resolve the deposit account exactly as customer-payments.routes.ts does when no bank_account_id
    // is supplied: undeposited_funds role, falling back to cash_clearing. Confirmed live: both roles
    // resolve to GL 1090 Undeposited Funds for USMCA -- correct per item 10's own law ("1090 holds
    // only undeposited receipts"): Faro collected this cash on our behalf: it is not yet a line on our
    // own bank register (1000), exactly what 1090 exists to hold.
    const depositRes = await client.query<{ account_id: string }>(
      `SELECT car.account_id::text
         FROM accounting.chart_of_accounts_roles car
         JOIN catalogs.accounts a ON a.id = car.account_id
        WHERE car.operating_company_id = $1::uuid AND car.role = 'undeposited_funds' AND car.is_active = true
          AND a.deactivated_at IS NULL AND a.is_postable = true
        ORDER BY car.updated_at DESC LIMIT 1`,
      [USMCA_ID]
    );
    const depositedToAccountId = depositRes.rows[0]?.account_id;
    if (!depositedToAccountId) throw new Error("undeposited_funds role account did not resolve live -- refusing to guess a deposit account");

    const { nextPaymentDisplayId } = await import("../../apps/backend/src/accounting/display-id.js");
    const { applyPayment } = await import("../../apps/backend/src/accounting/payments/apply.service.js");

    const results: Array<Record<string, unknown>> = [];

    for (const r of RECEIPTS) {
      const invRes = await client.query<{ id: string; customer_id: string; status: string; amount_open_cents: string; total_cents: string }>(
        `SELECT i.id::text, i.customer_id::text, i.status::text, i.amount_open_cents::text, i.total_cents::text
           FROM mdata.loads l
           JOIN accounting.invoices i ON i.source_load_id = l.id AND i.operating_company_id = l.operating_company_id
          WHERE l.operating_company_id = $1::uuid AND l.load_number = $2
          LIMIT 1`,
        [USMCA_ID, r.load_number]
      );
      const invoice = invRes.rows[0];
      if (!invoice) throw new Error(`load ${r.load_number} (Faro inv ${r.faro_inv}): no live invoice found -- STOP`);

      // Idempotency: if the invoice's open balance is already at or below the post-receipt target,
      // this receipt was already applied (a prior run of this same script) -- skip, never double-post.
      const targetOpenCents = Number(invoice.total_cents) - r.receipt_cents;
      const currentOpenCents = Number(invoice.amount_open_cents);
      if (currentOpenCents <= targetOpenCents) {
        console.log(`SKIP (already applied) load=${r.load_number} inv=${r.faro_inv}: open=${currentOpenCents} already <= target=${targetOpenCents}`);
        results.push({ load_number: r.load_number, faro_inv: r.faro_inv, status: "already_applied", open_cents: currentOpenCents });
        continue;
      }
      if (!["sent", "partial"].includes(invoice.status)) {
        throw new Error(`load ${r.load_number} (Faro inv ${r.faro_inv}): invoice status=${invoice.status}, not open for payment -- STOP`);
      }

      const displayId = await nextPaymentDisplayId(client, USMCA_ID, new Date(`${FARO_AGING_AS_OF}T00:00:00.000Z`));
      const paymentRes = await client.query<{ id: string }>(
        `INSERT INTO accounting.payments (
           operating_company_id, customer_id, display_id, payment_method, payment_date, reference,
           amount_cents, deposited_to_account_id, notes, created_by_user_id, payment_source_kind,
           source_bank_transaction_id, is_sample_data
         ) VALUES ($1,$2,$3,'other',$4,$5,$6,$7,$8,$9,'manual',NULL,false)
         RETURNING id::text`,
        [
          USMCA_ID,
          invoice.customer_id,
          displayId,
          FARO_AGING_AS_OF,
          `FARO-INV-${r.faro_inv}`,
          r.receipt_cents,
          depositedToAccountId,
          `ROUND 153 item 2 -- ${r.note}. Faro invoice ${r.faro_inv}, AGING REPORT.csv as-of ${FARO_AGING_AS_OF}.`,
          SYSTEM_ACTOR_USER_ID,
        ]
      );
      const paymentId = paymentRes.rows[0]?.id;
      if (!paymentId) throw new Error(`load ${r.load_number}: payment insert failed -- STOP`);

      const applyResult = await applyPayment(
        client,
        {
          operating_company_id: USMCA_ID,
          payment_id: paymentId,
          applications: [{ target_kind: "invoice", target_id: invoice.id, amount_cents: r.receipt_cents }],
        },
        { user_id: SYSTEM_ACTOR_USER_ID }
      );

      console.log(`POSTED load=${r.load_number} faro_inv=${r.faro_inv} payment=${displayId} receipt=$${(r.receipt_cents / 100).toFixed(2)} gl_posting=${applyResult.gl_posting}`);
      results.push({ load_number: r.load_number, faro_inv: r.faro_inv, payment_display_id: displayId, receipt_cents: r.receipt_cents, gl_posting: applyResult.gl_posting });
    }

    if (process.env.DRY_RUN === "1") {
      console.log("DRY_RUN=1 -- rolling back, nothing committed.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("COMMITTED.");
    }
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAILED, rolled back:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
