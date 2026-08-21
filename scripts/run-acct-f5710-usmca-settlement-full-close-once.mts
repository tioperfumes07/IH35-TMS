/**
 * ACCT-F5710 LIVE EXERCISE — prove the full driver-settlement lifecycle reaches BOTH terminal states
 * at once: status='closed' AND GL-posted. Per this session's own live read (2026-08-21), USMCA has 0
 * driver_settlements rows with status='closed' — every settlement that reached a GL-posted state
 * stopped at 'locked' (closeSettlementPayRun never writes status), and the one function that DOES
 * write status='closed' (closeLoadBookendedSettlementForDriver, load-bookended trip-close) posts no
 * GL at all. Neither existing function does both — this script chains the two REAL, already-mounted
 * functions in the same order dispatch calls them (pingSettlementOnLoadEvent's own open+close
 * sequence), then closes the pay-run on the now-'closed' settlement ('closed' is a member of
 * POSTABLE_STATUSES in settlement-payrun-close.service.ts, so this is not a new code path — it is
 * the same close function running on a settlement that happens to already carry status='closed').
 *
 * No new logic, no hand-written UPDATE, no invented money — every dollar traces to the real,
 * pre-existing driver_finance.driver_bills row B-20260802-... ($1,104.00) minted by the real load
 * booking path (dispatch/book-load.service.ts) for a REAL delivered load.
 *
 * Driver chosen: Juan USMCA-Battery (88c04cf5-9e32-455c-91e5-298a9b331b10) — the only USMCA driver
 * with a real, unsettled driver_bill AND zero other in-flight ("busy") loads blocking
 * closeLoadBookendedSettlementForDriver's multi-load-trip guard. Every other candidate (Neftali,
 * Rafael, Pedro) currently has at least one other load still in an active dispatch status, which the
 * busy-check correctly refuses to close around (protecting genuine multi-load bookending) — reported
 * separately, not forced open here.
 *
 * TEST-DATA labeling: driver_finance.driver_settlements has no free-text memo column (confirmed live,
 * 54 columns) — is_sample_data is the entire tag (migration 202612350000). openLoadBookendedSettlement
 * derives is_sample_data from the parent load by default; this script passes an explicit
 * isSampleData:true override (the one caller-supplied path the function itself documents as safe —
 * "only set this when a caller genuinely knows better than the load") so the settlement this exercise
 * creates is unambiguously marked TEST DATA regardless of the underlying load's own tag.
 *
 * Usage:
 *   DATABASE_URL=<direct> DATABASE_DIRECT_URL=<direct> npx tsx scripts/run-acct-f5710-usmca-settlement-full-close-once.mts [--commit]
 * Without --commit: step 3 (closeSettlementPayRun) runs previewOnly=true (its own built-in dry-run —
 * computes + returns the balanced JE preview, writes nothing). Steps 0-2 (provision + open + close)
 * always write — rehearse this script on a disposable Neon branch first, exactly like every other
 * WAVE3-class proof this session, before ever running --commit against prod.
 *
 * STEP 0 discovered live on the rehearsal branch: Juan has no provisioned per-driver escrow LIABILITY
 * sub-account — the same DRIVER_ESCROW_ACCOUNT_UNBOUND gap ACCT-F5680 backfilled for 11 USMCA drivers,
 * except ACCT-F5680's bulk roster query filters `deactivated_at IS NULL` (by design — it backfills the
 * ACTIVE roster) and Juan was deactivated 2026-08-17, after that backfill ran, so he was never covered.
 * He still has real, unsettled money (a genuine $1,104.00 driver_bill from a real delivered load), so
 * this calls the SAME bulk backfill function with an explicit single-driver override (its own
 * documented `input.drivers` escape hatch — no new logic) rather than skipping him or hand-rolling the
 * account insert.
 */
import pg from "pg";
import { withCurrentUser } from "../apps/backend/src/auth/db.ts";
import { runDriverSubAccountBackfill } from "../apps/backend/src/accounting/driver-subaccount-backfill.service.ts";
import {
  openLoadBookendedSettlement,
  closeSettlementForFinalLoad,
} from "../apps/backend/src/driver-finance/settlements-load-bookended.service.ts";
import { closeSettlementPayRun } from "../apps/backend/src/driver-finance/settlement-payrun-close.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DRIVER_ID = "88c04cf5-9e32-455c-91e5-298a9b331b10"; // Juan USMCA-Battery
const DRIVER_NAME = "Juan USMCA-Battery";
const LOAD_ID = "a6f8a7ec-942e-41a8-bc49-49c784d82aa2"; // L-20260802-0258, delivered, real driver_bill $1,104.00
const PAYMENT_METHOD_ID = "574d600c-7afe-4da7-a234-61148ffecc1f"; // USMCA active payment method, GL-bound
const COMMIT = process.argv.includes("--commit");

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) throw new Error("REFUSING -pooler: session GUCs do not survive transaction pooling under FORCE RLS");

console.log(`mode=${COMMIT ? "COMMIT (steps 0-2 write for real, step 3 previewOnly=false)" : "PREVIEW (steps 0-2 WILL still write on this branch — run on a disposable Neon branch only; step 3 previewOnly=true)"}`);

// Step 0: provision Juan's escrow (+ advance + AP vendor) sub-accounts via the EXISTING bulk backfill
// function, matching ACCT-F5680's own precedent (lucia-bypass connection — catalogs.accounts writes
// need it, same as the original backfill script).
{
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query(`RESET ROLE`);
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    const report = await runDriverSubAccountBackfill(client as never, {
      operatingCompanyId: USMCA,
      apply: true,
      actorUserId: ACTOR_USER_ID,
      drivers: [{ driverId: DRIVER_ID, driverName: DRIVER_NAME, hireDate: null }],
    });
    console.log("STEP 0 (sub-account provision):", JSON.stringify(report, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

// Steps 1-2: open the bookended settlement (tagged TEST DATA), then close it on delivery — the exact
// sequence pingSettlementOnLoadEvent runs from dispatch, called directly here with the same
// withCurrentUser transaction wrapper every route handler uses (RLS-enforced, not bypassed).
const openClose = await withCurrentUser(ACTOR_USER_ID, async (client) => {
  await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);

  const opened = await openLoadBookendedSettlement(client, {
    driverId: DRIVER_ID,
    operatingCompanyId: USMCA,
    firstLoadId: LOAD_ID,
    actorUserId: ACTOR_USER_ID,
    isSampleData: true, // explicit TEST DATA override — see file header
  });

  const closed = await closeSettlementForFinalLoad(client, {
    loadId: LOAD_ID,
    operatingCompanyId: USMCA,
    actorUserId: ACTOR_USER_ID,
  });

  return { opened, closed };
});

console.log("STEP 1-2 (open + close):", JSON.stringify(openClose, null, 2));

if (openClose.closed.closedSettlements !== 1) {
  console.error("closeSettlementForFinalLoad did not close exactly 1 settlement — stopping before pay-run close.");
  process.exit(1);
}

// Step 3: pay-run close (GL posting) on the now-status='closed' settlement. 'closed' is a member of
// POSTABLE_STATUSES (settlement-payrun-close.service.ts) — this is the same function/route real
// settlements go through, run here on a settlement that already carries status='closed'.
const payrun = await closeSettlementPayRun(
  {
    operatingCompanyId: USMCA,
    settlementId: openClose.opened.settlementId,
    paymentMethodId: PAYMENT_METHOD_ID,
    paymentReference: "ACCT-F5710 live exercise — USMCA TEST DATA",
    previewOnly: !COMMIT,
  },
  { userId: ACTOR_USER_ID }
);

console.log("STEP 3 (payrun close):", JSON.stringify(payrun, null, 2));
