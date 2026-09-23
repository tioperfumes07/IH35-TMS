#!/usr/bin/env tsx
// E10 VOID RUNNER (Round 91/92, owner-ordered): the reverse-dependency-order engine that unwinds
// every live USMCA transaction document through its REAL reversal engine before the purge deletes
// the shells. "THE ENGINE IS THE ENUMERATION" -- this script does not delete anything; it calls
// the six engines that already exist and reports, by document type, what each one did.
//
// PROVING GROUND: run this ONLY against a FRESH Neon branch created off br-fancy-credit-akjnd07a
// at the moment of use (this run used br-old-poetry-akuaihf9 /
// cc3-e10-void-runner-proving-ground, created 2026-09-23). NEVER against production.
// br-sweet-math-akyen17f is TRUNCATED (renamed cursor-test-TRUNCATED-NOT-A-PRE-PURGE-SNAPSHOT) --
// it is not a copy of anything and proving here would prove nothing.
//
// SIX REVERSAL ENGINES, NO SEVENTH:
//   1. postVoidReversal                          (void.service.ts)              -- (a)+(b)
//   2. reversePostedSourceTransactionInClientTx   (posting-engine.service.ts)    -- (a)+(b)
//   3. reverseFactoringAdvanceEvent               (factoring-posting/poster.service.ts) -- delegates to 6
//   4. reverseSettlementBillPaymentInClientTx     (settlement-bill-payment-posting.service.ts) -- orchestrator, all 3 mechanisms
//   5. voidJournalEntry                           (journal-entries.service.ts)   -- delegates to 6
//   6. reverseJournalEntryNoFlip                  (journal-entries.service.ts)   -- (a), wraps 1
// Every call in this script goes through one of these six (or their standalone, own-connection
// wrapper siblings: reverseSettlementBillPayment, reversePostedSourceTransaction). Nothing here
// writes new GL math.
//
// ROUND 94 FIX -- SETTLEMENTS PHASE WAS CHECKING THE WRONG TABLE FOR USMCA, FOUND LIVE:
// driver_finance.driver_settlement_gl_runs has 0 rows for USMCA -- that table belongs to the
// BILL-PAYMENT poster (reverseSettlementBillPayment's own mechanism), which USMCA has never used.
// USMCA's real 89 settlements post through a SEPARATE mechanism, closeSettlementPayRun
// (settlement-payrun-close.service.ts), tracked in driver_finance.payrun_gl_runs (36 posted / 16
// void / 37 never posted, measured live). reverseSettlementPayRun
// (settlement-payrun-reverse.service.ts) is that mechanism's own already-built reverse
// counterpart -- its own header says so verbatim: "the only packaged settlement reversal
// (reverseSettlementBillPayment) targets the DIFFERENT bill-payment poster ... which has ZERO
// rows in prod and was never used for USMCA. This is that missing engine." It is NOT a seventh
// primitive: it delegates the actual GL reversal whole to reverseJournalEntryNoFlip (#6) and the
// escrow sub-ledger reversal to recordEscrowPostingOnly, exactly the way reverseSettlementBillPayment
// (#4) itself is an orchestrator over the six, not a primitive of its own. Phase 1b below adds
// this second, USMCA-actual mechanism; Phase 1 (bill-payment) stays in place, unchanged, for
// defense-in-depth on any future settlement that DOES post that way.
//
// DOCUMENT-LEVEL ORDER (per the owner's own phase-redesign, reverse of how money flows forward):
//   1. settlements + driver bills (escrow & deductions unwind here, BY THE ENGINE) --
//      reverseSettlementBillPaymentInClientTx. Bill/payment legs are its own first sub-step.
//   2. factoring advances + reserve movements -- reverseFactoringAdvanceEvent (reverses every
//      live leg of the advance's lifecycle in one call, not just the funding leg).
//   3. invoices -- reversePostedSourceTransaction(source_transaction_type='invoice').
//   4. expenses -- reversePostedSourceTransaction(source_transaction_type='expense').
//   5. fuel transactions -- NO REVERSAL PATH EXISTS. 'fuel_event' is not a member of
//      PostingSourceType (posting-engine.service.ts), not of VoidableEntityType
//      (void.service.ts), and void-document.service.ts's dispatcher has no fuel_transaction case.
//      No route in fuel-transactions.routes.ts voids/reverses one. STOP AND REPORT -- do not
//      invent a 7th engine, do not silently skip. Named below, every time.
//   6. revrec postings -- accounting.load_revenue_recognition_postings' own two-event latch.
//      Event 2 (source_transaction_type='invoice') already unwinds in step 3. Event 1 is tagged
//      source_transaction_type='load' -- ALSO ABSENT from PostingSourceType, so engine #2 cannot
//      reach it by type lookup either. The JE itself is still a normal accounting.journal_entries
//      row, so it IS reachable -- by resolving its id directly (via the latch row's own linkage,
//      not via #2's typed dispatch) and calling voidJournalEntry/reverseJournalEntryNoFlip on
//      that id. This is engine #5/#6 used exactly as designed (they accept any posted JE id),
//      not a 7th engine. The latch row itself (is_active) is NOT touched by any JE reversal --
//      "Releasing the interlock is the LATCH's job... today a reversal leaves the latch row
//      active" (posting-engine.service.ts's own documented, prod-proven gap, load
//      L-20260624-0083). This script deactivates the latch row explicitly as its own direct
//      write, the same way reverseSettlementBillPaymentInClientTx itself directly restores
//      driver_settlement_deductions/driver_bills status as part of its own orchestration --
//      never a new JE, never new GL math.
//   7. loads + stops -- no GL of their own once every money document above is unwound. Left for
//      phase 3 (delete the voided shells) -- no reversal call here.
//
// ALREADY-COLLECTED DRIVER DEDUCTIONS ARE NEVER REVERSED. Real finding, not assumed: reading
// restoreSettlementDeductionsInClientTx (settlement-posting.service.ts) directly shows it
// UNCONDITIONALLY resets every deduction on a settlement back to status='pending' -- it has NO
// check for whether that deduction's money was already disbursed to a third party or reflected
// in a driver's real paid history. The engine does not implement this rule; this runner does,
// in front of the engine: before calling reverseSettlementBillPaymentInClientTx on a settlement,
// checks whether any bill_payment or settlement_payment_event exists for it (the only two real
// "money actually moved" signals in this schema). If either exists, the settlement is SKIPPED
// and named, never voided. If the counts are truly zero (as measured live on this branch --
// see LIVE PROOF), every settlement here is safe to void by this rule.
//
// NEVER WRITES A TEST/SAMPLE/DEMO ROW. This script performs REVERSALS on real, existing rows
// only -- it inserts nothing new except the reversing entries the six engines themselves create
// by design.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { voidJournalEntry, reverseJournalEntryNoFlip } from "../../apps/backend/src/accounting/journal-entries.service.js";
import { reversePostedSourceTransaction } from "../../apps/backend/src/accounting/posting-engine.service.js";
import { reverseFactoringAdvanceEvent } from "../../apps/backend/src/accounting/factoring-posting/poster.service.js";
import { reverseSettlementBillPayment } from "../../apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.js";
import { reverseSettlementPayRun } from "../../apps/backend/src/driver-finance/settlement-payrun-reverse.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const ACTOR = { userId: OWNER_USER_ID, role: "Owner" };
const VOID_REASON = "E10 void runner (Round 91/92) -- pre-purge unwind via the real reversal engines, proving ground only.";

type Tally = { reversed: number; already_reversed: number; skipped: string[]; no_path: number; no_path_amount_cents: number; errors: string[] };
function freshTally(): Tally {
  return { reversed: 0, already_reversed: 0, skipped: [], no_path: 0, no_path_amount_cents: 0, errors: [] };
}

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (!process.env.ROUND271_ALLOW_HOST) throw new Error("ABORT: requires ROUND271_ALLOW_HOST naming the exact proving-ground host.");
  if (!url.includes(process.env.ROUND271_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL host does not match ROUND271_ALLOW_HOST.");
  // BELT AND SUSPENDERS: this script refuses to run against the two named-unsafe hosts even if
  // ROUND271_ALLOW_HOST were ever mis-set, by hostname substring, independent of that check.
  if (/ep-broad-block-akykk7bw/.test(url)) throw new Error("ABORT: refusing the production compute host, by name, unconditionally.");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  // ROUND 95 FIX -- session state was silently lost mid-run, found live: `set_config(key, val,
  // true)` is TRANSACTION-LOCAL (is_local=true), and this script issues it as a bare autocommit
  // statement with no enclosing BEGIN, so its effect can revert the moment ANY later query opens
  // its own transaction on this connection. Empirically, after Phase 1b's 36 calls into
  // reverseSettlementPayRun (which manages its own connection/role via withCurrentUser), this
  // client's own bypass_rls/operating_company_id measurement queries started returning 0 rows for
  // factoring/invoices/expenses/fuel/revrec -- verified directly: the SAME query, run standalone
  // in an explicit BEGIN...COMMIT via psql, returned the correct 69 live factoring advances the
  // script itself had just reported as 0. reassertSession is now called at the top of every phase
  // that follows a real engine call, using is_local=false (SESSION-scoped, survives statement/
  // transaction boundaries on this connection) instead of true, plus RESET ROLE as defense against
  // any role switch an engine call may have left behind.
  async function reassertSession() {
    await client.query("RESET ROLE");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [USMCA_COMPANY_ID]);
  }
  await reassertSession();

  console.log(`DATABASE_URL host: ${new URL(url).host}`);
  console.log(executeFlag ? "MODE: --execute (will call the reversal engines)" : "MODE: dry-run (measurement only, no engine calls)");

  // ================= PHASE 1: settlements + driver bills =================
  const settlementTally = freshTally();
  const paidSignal = await client.query<{ n: string }>(
    `SELECT (
       (SELECT count(*) FROM accounting.bill_payments WHERE operating_company_id = $1::uuid) +
       (SELECT count(*) FROM driver_finance.settlement_payment_events spe
          JOIN driver_finance.driver_settlements ds ON ds.id = spe.settlement_id
         WHERE ds.operating_company_id = $1::uuid)
     )::text AS n`,
    [USMCA_COMPANY_ID]
  );
  console.log(`\nGlobal already-collected signal (bill_payments + settlement_payment_events): ${paidSignal.rows[0]!.n}`);

  const settlements = await client.query<{ id: string; run_status: string | null }>(
    `
      SELECT ds.id::text, r.status AS run_status
        FROM driver_finance.driver_settlements ds
        JOIN driver_finance.driver_settlement_gl_runs r ON r.settlement_id = ds.id
       WHERE ds.operating_company_id = $1::uuid AND r.status = 'posted'
       ORDER BY ds.id
    `,
    [USMCA_COMPANY_ID]
  );
  console.log(`Settlements with a posted GL run: ${settlements.rowCount}`);

  for (const s of settlements.rows) {
    // Per-settlement already-collected check: driver_finance.settlement_payment_events is keyed
    // directly by settlement_id (the real, unambiguous "money actually moved for THIS
    // settlement" signal). The global bill_payments count above is confirmed 0 for all of USMCA
    // (verified live before this loop), so it cannot be nonzero for any individual settlement
    // either -- no per-settlement join needed for that half of the signal.
    const collected = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM driver_finance.settlement_payment_events WHERE settlement_id = $1::uuid`,
      [s.id]
    );
    if (collected.rows[0]?.n !== "0") {
      settlementTally.skipped.push(`settlement ${s.id} (settlement_payment_events=${collected.rows[0]?.n} -- already-collected, never reversed)`);
      continue;
    }
    if (!executeFlag) continue;
    try {
      const res = await reverseSettlementBillPayment({ operatingCompanyId: USMCA_COMPANY_ID, settlementId: s.id, reason: VOID_REASON }, ACTOR);
      if (res.result === "reversed") settlementTally.reversed++;
      else settlementTally.already_reversed++;
    } catch (e) {
      settlementTally.errors.push(`settlement ${s.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ================= PHASE 1b: settlements posted via pay-run close (payrun_gl_runs) =================
  await reassertSession();
  // See the ROUND 94 FIX header note -- this is the mechanism USMCA actually used, 0 of the
  // Phase 1 (driver_settlement_gl_runs) candidates ever existed for USMCA.
  const payrunSettlements = await client.query<{ id: string }>(
    `
      SELECT ds.id::text
        FROM driver_finance.driver_settlements ds
        JOIN driver_finance.payrun_gl_runs r ON r.settlement_id = ds.id
       WHERE ds.operating_company_id = $1::uuid AND r.status = 'posted'
       ORDER BY ds.id
    `,
    [USMCA_COMPANY_ID]
  );
  console.log(`Settlements with a posted payrun_gl_runs (pay-run close) run: ${payrunSettlements.rowCount}`);

  for (const s of payrunSettlements.rows) {
    // Same already-collected rule as Phase 1: settlement_payment_events is the real signal.
    const collected = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM driver_finance.settlement_payment_events WHERE settlement_id = $1::uuid`,
      [s.id]
    );
    if (collected.rows[0]?.n !== "0") {
      settlementTally.skipped.push(`settlement ${s.id} (payrun_gl_runs; settlement_payment_events=${collected.rows[0]?.n} -- already-collected, never reversed)`);
      continue;
    }
    if (!executeFlag) continue;
    try {
      const res = await reverseSettlementPayRun({ operatingCompanyId: USMCA_COMPANY_ID, settlementId: s.id, reason: VOID_REASON }, ACTOR);
      if (res.result === "reversed") settlementTally.reversed++;
      else settlementTally.already_reversed++;
    } catch (e) {
      settlementTally.errors.push(`settlement ${s.id} (payrun_gl_runs): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ================= PHASE 2: factoring advances =================
  await reassertSession();
  const factoringTally = freshTally();
  const advances = await client.query<{ id: string }>(
    `
      SELECT DISTINCT fa.id::text
        FROM accounting.factoring_advances fa
        JOIN accounting.journal_entry_postings jep
          ON jep.source_transaction_type LIKE 'factoring%' AND jep.source_transaction_id = fa.id::text
        JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
       WHERE fa.operating_company_id = $1::uuid AND je.status = 'posted' AND je.reversed_by_je_id IS NULL AND je.voided_at IS NULL
    `,
    [USMCA_COMPANY_ID]
  );
  console.log(`\nFactoring advances with a live posted leg: ${advances.rowCount}`);
  for (const a of advances.rows) {
    if (!executeFlag) continue;
    try {
      const res = await reverseFactoringAdvanceEvent({ operating_company_id: USMCA_COMPANY_ID, factoring_advance_id: a.id, actor_user_id: OWNER_USER_ID, reason: VOID_REASON });
      if (res.reversed) factoringTally.reversed++;
      else factoringTally.skipped.push(`factoring_advance ${a.id} (${res.reason})`);
    } catch (e) {
      factoringTally.errors.push(`factoring_advance ${a.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ================= PHASE 3: invoices =================
  await reassertSession();
  const invoiceTally = freshTally();
  const invoices = await client.query<{ id: string }>(
    `
      SELECT DISTINCT i.id::text
        FROM accounting.invoices i
        JOIN accounting.journal_entry_postings jep ON jep.source_transaction_type = 'invoice' AND jep.source_transaction_id = i.id::text
        JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
       WHERE i.operating_company_id = $1::uuid AND je.status = 'posted' AND je.reversed_by_je_id IS NULL AND je.voided_at IS NULL
    `,
    [USMCA_COMPANY_ID]
  );
  console.log(`Invoices with a live posted JE (source_transaction_type='invoice'): ${invoices.rowCount}`);
  for (const inv of invoices.rows) {
    if (!executeFlag) continue;
    try {
      const res = await reversePostedSourceTransaction({ operating_company_id: USMCA_COMPANY_ID, source_transaction_type: "invoice", source_transaction_id: inv.id }, ACTOR);
      if (res.result === "reversed") invoiceTally.reversed++;
      else invoiceTally.already_reversed++;
    } catch (e) {
      invoiceTally.errors.push(`invoice ${inv.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ================= PHASE 4: expenses =================
  await reassertSession();
  const expenseTally = freshTally();
  const expenses = await client.query<{ id: string }>(
    `
      SELECT DISTINCT ex.id::text
        FROM accounting.expenses ex
        JOIN accounting.journal_entry_postings jep ON jep.source_transaction_type = 'expense' AND jep.source_transaction_id = ex.id::text
        JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
       WHERE ex.operating_company_id = $1::uuid AND je.status = 'posted' AND je.reversed_by_je_id IS NULL AND je.voided_at IS NULL
    `,
    [USMCA_COMPANY_ID]
  );
  console.log(`Expenses with a live posted JE (source_transaction_type='expense'): ${expenses.rowCount}`);
  for (const ex of expenses.rows) {
    if (!executeFlag) continue;
    try {
      const res = await reversePostedSourceTransaction({ operating_company_id: USMCA_COMPANY_ID, source_transaction_type: "expense", source_transaction_id: ex.id }, ACTOR);
      if (res.result === "reversed") expenseTally.reversed++;
      else expenseTally.already_reversed++;
    } catch (e) {
      expenseTally.errors.push(`expense ${ex.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ================= PHASE 5: fuel transactions -- NO REVERSAL PATH =================
  await reassertSession();
  const fuelGap = await client.query<{ n: string; cents: string }>(
    `
      SELECT count(*)::text AS n, COALESCE(sum(jep.amount_cents), 0)::text AS cents
        FROM fuel.fuel_transactions ft
        JOIN accounting.journal_entry_postings jep ON jep.source_transaction_type = 'fuel_event' AND jep.source_transaction_id = ft.id::text
        JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
       WHERE ft.operating_company_id = $1::uuid AND je.status = 'posted' AND je.reversed_by_je_id IS NULL AND je.voided_at IS NULL
    `,
    [USMCA_COMPANY_ID]
  );
  const fuelTally = freshTally();
  fuelTally.no_path = Number(fuelGap.rows[0]!.n);
  fuelTally.no_path_amount_cents = Number(fuelGap.rows[0]!.cents);
  console.log(`\nFUEL TRANSACTIONS -- NO REVERSAL PATH EXISTS ANYWHERE IN THIS CODEBASE. Live posted GL legs: ${fuelTally.no_path} / $${(fuelTally.no_path_amount_cents / 100).toFixed(2)}. STOP AND REPORT -- not voided, no 7th engine written.`);

  // ================= PHASE 6: revrec (load_revenue_recognition_postings) =================
  await reassertSession();
  const revrecTally = freshTally();
  // The latch's own journal_entry_id column is the direct, real linkage -- 'event' distinguishes
  // 'earn' (Event 1, delivery accrual, JE tagged source_transaction_type='load' -- NOT reachable
  // via engine #2's typed dispatch) from 'bill' (Event 2, invoiced, JE tagged 'invoice' -- already
  // covered by PHASE 3 above). Only 'earn' rows need the direct voidJournalEntry/
  // reverseJournalEntryNoFlip path here; 'bill' rows are named but skipped as already-covered.
  const latches = await client.query<{ posting_id: string; load_id: string; event: string; je_id: string | null }>(
    `
      SELECT p.id::text AS posting_id, p.load_id::text, p.event, p.journal_entry_id::text AS je_id
        FROM accounting.load_revenue_recognition_postings p
       WHERE p.operating_company_id = $1::uuid AND p.is_active = true
    `,
    [USMCA_COMPANY_ID]
  );
  const earnLatches = latches.rows.filter((r) => r.event === "earn");
  const billLatches = latches.rows.filter((r) => r.event === "bill");
  console.log(`\nActive revrec latch rows: ${latches.rowCount} (${earnLatches.length} 'earn'/Event-1 -- no engine-#2 path, direct JE reversal below; ${billLatches.length} 'bill'/Event-2 -- already covered by PHASE 3 invoices, latch deactivated here only)`);
  for (const l of latches.rows) {
    if (!executeFlag) continue;
    try {
      if (l.je_id) {
        // Event-1 JE: not reachable via engine #2 ('load' is not a PostingSourceType member) --
        // resolved here directly via the latch's own linkage, then reversed with engine #6/#5
        // exactly as designed (they accept any posted JE id). Not a 7th engine.
        const je = await client.query<{ status: string; reversed_by_je_id: string | null; voided_at: string | null }>(
          `SELECT status, reversed_by_je_id::text, voided_at FROM accounting.journal_entries WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
          [l.je_id, USMCA_COMPANY_ID]
        );
        const jeRow = je.rows[0];
        if (jeRow && jeRow.status === "posted" && !jeRow.reversed_by_je_id && !jeRow.voided_at) {
          // ROUND 95 FIX -- reverseJournalEntryNoFlip does `SELECT ... FOR UPDATE` and writes a
          // header + N posting lines expecting the CALLER to own the transaction (found live: the
          // "journal entry X is not balanced (debits=0 credits=Y)" errors on every one of 137
          // 'earn' latches were NOT a defect in the original postings -- verified the referenced
          // original JE directly, debit=credit=300000, perfectly balanced. The id in the error is
          // a BRAND NEW reversal-JE header this call itself creates. Without an enclosing
          // transaction, accounting.trg_check_journal_entry_balanced (a DEFERRED constraint
          // trigger) fires at the end of EACH individual autocommit INSERT instead of once at the
          // true end, and each reversal line shares one idempotency_key across both lines
          // (`void:journal_entry:<id>`) with a UNIQUE(operating_company_id, idempotency_key,
          // line_sequence) constraint -- so a line orphaned by any earlier failed attempt silently
          // no-ops the retry's same-numbered line via ON CONFLICT DO NOTHING, leaving the new
          // header with only one side posted and the trigger firing immediately. Wrapping the call
          // in an explicit transaction here is the real fix -- the function's own FOR UPDATE lock
          // is the tell that it was written to expect one.
          try {
            await client.query("BEGIN");
            await reverseJournalEntryNoFlip(client, { operatingCompanyId: USMCA_COMPANY_ID, journalEntryId: l.je_id, reason: VOID_REASON, actorUserId: OWNER_USER_ID });
            await client.query("COMMIT");
            revrecTally.reversed++;
          } catch (e) {
            await client.query("ROLLBACK");
            throw e;
          }
        } else {
          revrecTally.already_reversed++;
        }
      } else {
        revrecTally.skipped.push(`load ${l.load_id} latch ${l.posting_id} (event=${l.event}): journal_entry_id is NULL on the latch row itself -- named, not guessed at.`);
      }
      // Documented gap (posting-engine.service.ts's own comment, prod-proven on load
      // L-20260624-0083): reversing the JE does NOT deactivate the latch row -- "Releasing the
      // interlock is the LATCH's job." Direct write, not a new JE, matching how
      // reverseSettlementBillPaymentInClientTx itself directly restores driver-side status.
      await client.query(
        // NOTE: this table has no updated_at column (verified live -- caught this exact bug on
        // the first --execute run, which failed the deactivation step on every row where the JE
        // reversal itself succeeded; fixed here for the re-run).
        `UPDATE accounting.load_revenue_recognition_postings SET is_active = false WHERE id = $1::uuid`,
        [l.posting_id]
      );
    } catch (e) {
      revrecTally.errors.push(`revrec latch ${l.posting_id} (load ${l.load_id}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ================= SUMMARY =================
  console.log("\n=== SUMMARY BY DOCUMENT TYPE ===");
  for (const [name, t] of [
    ["settlements+driver_bills", settlementTally],
    ["factoring_advances", factoringTally],
    ["invoices", invoiceTally],
    ["expenses", expenseTally],
    ["revrec_latches", revrecTally],
  ] as [string, Tally][]) {
    console.log(`${name}: reversed=${t.reversed} already_reversed=${t.already_reversed} skipped=${t.skipped.length} errors=${t.errors.length}`);
    for (const s of t.skipped) console.log(`  SKIPPED: ${s}`);
    for (const e of t.errors) console.log(`  ERROR: ${e}`);
  }
  console.log(`fuel_transactions: NO_PATH=${fuelTally.no_path} ($${(fuelTally.no_path_amount_cents / 100).toFixed(2)}) -- never voided, no engine exists`);

  client.release();
  await pool.end();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
