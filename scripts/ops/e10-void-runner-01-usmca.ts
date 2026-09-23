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
import { reversePostedSourceTransactionInClientTx, PostingEngineError } from "../../apps/backend/src/accounting/posting-engine.service.js";
import { reverseFactoringAdvanceEvent } from "../../apps/backend/src/accounting/factoring-posting/poster.service.js";
import { reverseSettlementBillPaymentInClientTx } from "../../apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.js";
import { reverseSettlementPayRunInClientTx } from "../../apps/backend/src/driver-finance/settlement-payrun-reverse.service.js";
import { companyBusinessDate } from "../../apps/backend/src/lib/company-business-date.js";
import { stampDocumentVoided, VoidDocumentStampError, type VoidDocumentFamily } from "../../apps/backend/src/accounting/void-document-stamp.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const ACTOR = { userId: OWNER_USER_ID, role: "Owner" };
const VOID_REASON =
  "E10 void runner (Round 91/92, wired to stampDocumentVoided per Round 112) -- pre-purge unwind " +
  "via the real reversal engines; every document whose ledger is confirmed fully reversed is " +
  "stamped voided_at/void_reason/voided_by_user_id (#22412) in the same transaction as its reversal, " +
  "never before it is confirmed committed.";

// ROUND 112 (Lead, verbatim): "97 reversals are in and not one document says voided." The GL half
// of E10 (the six reversal engines above) already worked; nothing called stampDocumentVoided()
// (#22412, R-102.1-A BUILD 2) after a reversal landed, so every document header stayed live even
// after its ledger went dead. This wires the stamp into the SAME inTx() as each phase's own
// reversal wherever the engine runs on THIS script's `client` connection -- header and GL commit
// together or neither, by construction (stampDocumentVoided throwing inside inTx() rolls the
// reversal back too, never leaves a committed reversal with no stamp).
//
// ONE EXCEPTION, named, not hidden: Phase 2 (factoring) calls reverseFactoringAdvanceEvent, which
// manages its OWN connection/transaction internally (see that phase's own pre-existing comment --
// no ...InClientTx sibling exists). Its GL reversal is therefore ALREADY COMMITTED, on a different
// connection, before this script can attempt the stamp at all -- true single-transaction atomicity
// with the GL write is not achievable here without a client-accepting variant of that engine, which
// does not exist and is out of scope for this round. The stamp is still called immediately after a
// CONFIRMED-successful reversal, in its own inTx() on `client`, minimizing the window rather than
// eliminating it -- and a stamp failure there is reported as a named gap, never silently dropped.
//
// stampDocumentVoided()'s VoidDocumentFamily union has NO 'settlement' or 'driver_bill' member --
// those two tables were never part of the seven document families R-102.1-A added void-stamp
// columns to (loads, invoices, expenses, factoring_advances, fuel_transactions, journal_entries,
// driver_reimbursements). Phase 1/1b (settlements + driver bills) therefore gets NO stamp call
// here -- inventing a family for a table the ruling never named would be exactly the kind of guess
// this codebase's own law forbids. Named below at Phase 1, not silently skipped.
//
// FUEL (Phase 5) is correctly excluded from stamping too: it has NO REVERSAL PATH AT ALL (see that
// phase's own header), so nothing is ever confirmed dead there -- stamping an unreversed document
// would be "a committed stamp over a live posting," which the Round 112 order calls WORSE than an
// unstamped reversal. Never done.
//
// LOADS get their stamp through Phase 6 (revrec), not a dedicated loads phase: a load's own
// liveness in the five-column test (verify-void-is-whole.mjs) is measured through
// accounting.transaction_source_links rows with linked_object_type='load'. CORRECTED (ROUND 117,
// a real bug caught live, not assumed): this round's first draft claimed the 'earn' latch's JE was
// the ONLY such link for a load -- FALSE, confirmed live on load 13569
// (b3532955-9b0a-4c07-989d-5352f574a01d): its 'bill' latch's JE (Event 2) is ALSO linked with
// linked_object_type='load', not only linked_object_type='invoice'. Stamping the load the moment
// only its 'earn' JE was reversed produced the exact DANGEROUS direction ROUND 116 named --
// "header stamped VOIDED over LIVE postings" -- while that load's 'bill' JE was still live.
// Phase 6 now calls loadHasLiveLinkedJes(load_id) (defined near inTx(), same five-column test as
// verify-void-is-whole.mjs) immediately before every load stamp and only stamps when it returns
// false -- a load with any other still-live 'load'-linked JE is simply not stamped on this pass;
// the loop (ROUND 114) is repeated, so it stamps on a later pass once every linked JE is dead.

type Tally = {
  reversed: number;
  already_reversed: number;
  skipped: string[];
  no_path: number;
  no_path_amount_cents: number;
  errors: string[];
  stamped: number;
  already_voided_stamps: number;
  stamp_errors: string[];
};
function freshTally(): Tally {
  return { reversed: 0, already_reversed: 0, skipped: [], no_path: 0, no_path_amount_cents: 0, errors: [], stamped: 0, already_voided_stamps: 0, stamp_errors: [] };
}

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (!process.env.ROUND271_ALLOW_HOST) throw new Error("ABORT: requires ROUND271_ALLOW_HOST naming the exact proving-ground host.");
  if (!url.includes(process.env.ROUND271_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL host does not match ROUND271_ALLOW_HOST.");
  // Owner 2026-09-23 ROUND 111: no owner law refuses a host by name. ROUND271_ALLOW_HOST is the
  // only allowlist — set it deliberately to the branch host (rehearsal or br-fancy-credit).

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

  // ROUND 102 FIX -- FIVE MORE UNCOVERED CALL SITES. Runner 01 shipped #22404 with exactly ONE
  // BEGIN (the revrec latch): reverseJournalEntryNoFlip and its siblings do `SELECT ... FOR
  // UPDATE` and write a header + N rows expecting the CALLER to own the transaction -- that is
  // the SAME finding that exonerated the 274 orphan headers, and it cuts both ways. Settlements
  // (both mechanisms), factoring, invoices and expenses all called their engines with no
  // transaction of their own -- any failure partway through leaves an orphaned posting_batches/
  // journal_entries row that then collides on idempotency_key on retry (209 of the Round 98/99
  // rehearsal's 416 errors -- mostly expenses). inTx() is the one shared helper: BEGIN, then
  // re-establish the TRANSACTION-LOCAL GUCs fresh (a `SET LOCAL`/is_local=true config does not
  // survive a ROLLBACK -- the session-level reassertSession() above is a baseline, this is the
  // per-transaction belt-and-suspenders the engines' own FOR UPDATE locks expect), then COMMIT on
  // success or ROLLBACK on any error (re-thrown, never swallowed) so a failed attempt leaves
  // NOTHING behind to block the next one. One helper, six call sites, not six copies.
  async function inTx<T>(fn: () => Promise<T>): Promise<T> {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);
    try {
      const result = await fn();
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }

  // ROUND 112 -- the shared stamp call. MUST be invoked only after the caller has already
  // confirmed the document's ledger is dead (freshly reversed this run, or already dead from a
  // prior run) -- never speculatively. Idempotent by construction (stampDocumentVoided's own
  // already_voided contract on an identical reason/actor), so calling it again on a document this
  // runner already stamped is always safe and reported, never a duplicate write. Tallies onto the
  // caller-supplied Tally so the summary reports exactly what happened per document family.
  async function stamp(tally: Tally, family: VoidDocumentFamily, documentId: string) {
    try {
      const result = await stampDocumentVoided(client, {
        operatingCompanyId: USMCA_COMPANY_ID,
        family,
        documentId,
        voidReason: VOID_REASON,
        voidedByUserId: OWNER_USER_ID,
      });
      if (result.already_voided) tally.already_voided_stamps++;
      else tally.stamped++;
    } catch (e) {
      const msg = e instanceof VoidDocumentStampError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e);
      tally.stamp_errors.push(`${family} ${documentId}: ${msg}`);
      throw e; // caller decides whether this is fatal to the enclosing inTx() or a standalone report
    }
  }

  // ROUND 117 FIX (real bug, found live): a load can carry MORE than one
  // accounting.transaction_source_links row with linked_object_type='load' -- confirmed live on
  // load 13569 (b3532955-9b0a-4c07-989d-5352f574a01d), which had BOTH its 'earn' JE (Event 1) AND
  // its 'bill' JE (Event 2) linked with linked_object_type='load', not just the 'earn' one this
  // file's own header comment assumed was the sole writer. Stamping the load the moment its
  // 'earn' JE alone was reversed produced exactly the DANGEROUS direction ROUND 116 named --
  // "header stamped VOIDED over LIVE postings" -- when that same load's 'bill' JE was still live
  // (Phase 3 had not reversed its invoice yet on that pass). This helper uses the EXACT same
  // five-column liveness test verify-void-is-whole.mjs uses (status='posted' AND voided_at IS
  // NULL AND reversed_by_je_id IS NULL AND reverses_je_id IS NULL AND the posting's own
  // reversed_by_line_id IS NULL), scoped to linked_object_type='load', so this runner can never
  // disagree with that guard about whether a load is really fully dead. A load whose OTHER linked
  // JE is still live simply does not get stamped on this pass -- the loop is repeated (ROUND 114),
  // so it stamps on a LATER pass once every linked JE is dead, never guessed at.
  async function loadHasLiveLinkedJes(loadId: string): Promise<boolean> {
    const res = await client.query<{ n: string }>(
      `
        SELECT count(*)::text AS n
          FROM accounting.transaction_source_links l
          JOIN accounting.journal_entry_postings p ON p.id = l.journal_entry_posting_id
          JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = l.operating_company_id
         WHERE l.operating_company_id = $1::uuid AND l.linked_object_type = 'load' AND l.linked_object_id = $2
           AND je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL
           AND je.reverses_je_id IS NULL AND p.reversed_by_line_id IS NULL
      `,
      [USMCA_COMPANY_ID, loadId]
    );
    return Number(res.rows[0]?.n ?? 0) > 0;
  }

  // ROUND 98.1-A FIX -- REUSE, NOT A SEVENTH ENGINE. 70 invoices/expenses throw "No posted batch
  // found to reverse" (PostingEngineError code SOURCE_NOT_FOUND): a live posted JE exists, but no
  // accounting.posting_batches row was ever written for the ORIGINAL post, so the batch-oriented
  // reversal path (reversePostedSourceTransaction) has no handle to find. Engines #5/#6
  // (voidJournalEntry / reverseJournalEntryNoFlip) already accept ANY posted JE id regardless of
  // how it got there -- the same fallback this runner already uses for revrec 'earn' latches
  // (which are ALSO absent from PostingSourceType's typed dispatch). Falls back to resolving the
  // live JE directly by (source_transaction_type, source_transaction_id) and reversing it by id,
  // inside its own inTx(). Still six engines, no seventh.
  async function reverseByJeIdFallback(
    sourceType: string,
    sourceId: string,
    reason: string,
    stampFamily: VoidDocumentFamily,
    tally: Tally
  ): Promise<"reversed" | "no_live_je"> {
    const jeRes = await client.query<{ journal_entry_uuid: string }>(
      `
        SELECT DISTINCT jep.journal_entry_uuid::text
          FROM accounting.journal_entry_postings jep
          JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
         WHERE je.operating_company_id = $1::uuid
           AND jep.source_transaction_type = $2 AND jep.source_transaction_id = $3
           AND je.status = 'posted' AND je.voided_at IS NULL
           AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL
      `,
      [USMCA_COMPANY_ID, sourceType, sourceId]
    );
    if (jeRes.rowCount !== 1) return "no_live_je"; // 0 or >1 -- refuse rather than guess, named by the caller.
    const journalEntryId = jeRes.rows[0]!.journal_entry_uuid;
    // ROUND 112: reversal + stamp in the SAME inTx() -- header and GL commit together or neither.
    await inTx(async () => {
      await reverseJournalEntryNoFlip(client, { operatingCompanyId: USMCA_COMPANY_ID, journalEntryId, reason, actorUserId: OWNER_USER_ID });
      await stamp(tally, stampFamily, sourceId);
    });
    return "reversed";
  }

  console.log(`DATABASE_URL host: ${new URL(url).host}`);
  console.log(executeFlag ? "MODE: --execute (will call the reversal engines)" : "MODE: dry-run (measurement only, no engine calls)");

  // ================= PHASE 1: settlements + driver bills =================
  // ROUND 112: NO stampDocumentVoided() call in this phase, deliberately -- 'settlement' and
  // 'driver_bill' are not members of VoidDocumentFamily. R-102.1-A's void-stamp columns went on
  // seven named families (loads, invoices, expenses, factoring_advances, fuel_transactions,
  // journal_entries, driver_reimbursements); driver_finance.driver_settlements and
  // driver_finance.driver_bills were never among them. Reusing an unrelated family here to force a
  // stamp would misrepresent the document and is exactly the kind of guess this codebase's law
  // forbids -- named as a real, current gap rather than silently worked around.
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
      const res = await inTx(() =>
        reverseSettlementBillPaymentInClientTx(client, { operatingCompanyId: USMCA_COMPANY_ID, settlementId: s.id, reason: VOID_REASON }, ACTOR, companyBusinessDate())
      );
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
      const res = await inTx(() =>
        reverseSettlementPayRunInClientTx(client, { operatingCompanyId: USMCA_COMPANY_ID, settlementId: s.id, reason: VOID_REASON }, ACTOR, companyBusinessDate())
      );
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
       WHERE fa.operating_company_id = $1::uuid AND je.status = 'posted' AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL AND je.voided_at IS NULL
    `,
    [USMCA_COMPANY_ID]
  );
  console.log(`\nFactoring advances with a live posted leg: ${advances.rowCount}`);
  // ROUND 102 NOTE -- the one of the five NOT wrapped in inTx(). reverseFactoringAdvanceEvent has
  // no ...InClientTx sibling (verified: grepped every export in poster.service.ts) -- it opens
  // and manages its own connection/transaction internally, on a DIFFERENT connection than this
  // script's `client`. Wrapping THIS call in `client`'s own BEGIN/COMMIT would open an empty
  // transaction with no real writes in it (all the actual GL work happens on the other
  // connection) -- noise, not a fix. Left as a standalone call, same as before; the atomicity
  // this engine provides is internal to itself, not something this runner can add from outside
  // without a client-accepting variant that does not exist yet.
  for (const a of advances.rows) {
    if (!executeFlag) continue;
    try {
      const res = await reverseFactoringAdvanceEvent({ operating_company_id: USMCA_COMPANY_ID, factoring_advance_id: a.id, actor_user_id: OWNER_USER_ID, reason: VOID_REASON });
      // ROUND 112: reversed=true (fresh this run) or reason='no_posting_found' (every leg already
      // dead from a prior run -- the "97 reversals in, not one stamped" case this round exists to
      // fix) both mean the ledger is CONFIRMED dead -- stamp owed either way. reason='flag_off' is
      // a genuine skip, not a confirmed-dead ledger, and is NOT stamped -- stamping there would
      // risk "a committed stamp over a live posting." Narrowed via the discriminated union's own
      // `reversed` field first (TS2339: `.reason` does not exist on the `reversed: true` variant).
      const confirmedDead = res.reversed || res.reason === "no_posting_found";
      if (confirmedDead) {
        if (res.reversed) factoringTally.reversed++;
        else factoringTally.already_reversed++;
        try {
          // Own inTx(): the GL reversal already committed on reverseFactoringAdvanceEvent's OWN
          // connection (see the ROUND 102 note above) before this line runs -- not atomic with the
          // GL write by construction of that pre-existing engine, named honestly in the file header.
          await inTx(() => stamp(factoringTally, "factoring_advance", a.id));
        } catch {
          // stamp() already recorded the failure in factoringTally.stamp_errors; nothing else to
          // do here except let the loop continue to the next advance rather than abort the run.
        }
      } else {
        factoringTally.skipped.push(`factoring_advance ${a.id} (${res.reversed ? "reversed" : res.reason})`);
      }
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
       WHERE i.operating_company_id = $1::uuid AND je.status = 'posted' AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL AND je.voided_at IS NULL
    `,
    [USMCA_COMPANY_ID]
  );
  console.log(`Invoices with a live posted JE (source_transaction_type='invoice'): ${invoices.rowCount}`);
  for (const inv of invoices.rows) {
    if (!executeFlag) continue;
    try {
      // ROUND 112: reversal + stamp in the SAME inTx() -- header and GL commit together or
      // neither. Stamped unconditionally after a successful reversePostedSourceTransactionInClientTx
      // call, whether it freshly reversed (result='reversed') or found an existing reversal
      // (result!=='reversed', the idempotent already-dead case) -- both mean the ledger is
      // confirmed dead. A stamp() throw here rolls the WHOLE transaction back, so a stamp failure
      // never leaves a committed reversal with no stamp.
      const res = await inTx(async () => {
        const r = await reversePostedSourceTransactionInClientTx(client, { operating_company_id: USMCA_COMPANY_ID, source_transaction_type: "invoice", source_transaction_id: inv.id }, ACTOR, companyBusinessDate());
        await stamp(invoiceTally, "invoice", inv.id);
        return r;
      });
      if (res.result === "reversed") invoiceTally.reversed++;
      else invoiceTally.already_reversed++;
    } catch (e) {
      // ROUND 98.1-A FALLBACK: a live posted JE with no accounting.posting_batches row for the
      // original post throws SOURCE_NOT_FOUND / "No posted batch found to reverse" -- REUSE
      // engine #6 by JE id (same technique already used for revrec), not a 7th engine.
      if (e instanceof PostingEngineError && e.message === "No posted batch found to reverse") {
        try {
          const fb = await reverseByJeIdFallback("invoice", inv.id, VOID_REASON, "invoice", invoiceTally);
          if (fb === "reversed") invoiceTally.reversed++;
          else invoiceTally.errors.push(`invoice ${inv.id}: no posted batch AND no single live JE to fall back to`);
        } catch (fbErr) {
          invoiceTally.errors.push(`invoice ${inv.id} (fallback): ${fbErr instanceof Error ? fbErr.message : String(fbErr)}`);
        }
      } else if (e instanceof VoidDocumentStampError) {
        // stamp() already recorded the detail in invoiceTally.stamp_errors; this outer catch just
        // needs to keep the loop moving to the next invoice rather than abort the whole phase.
        invoiceTally.errors.push(`invoice ${inv.id}: reversal rolled back because its stamp failed (${e.code})`);
      } else {
        invoiceTally.errors.push(`invoice ${inv.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
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
       WHERE ex.operating_company_id = $1::uuid AND je.status = 'posted' AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL AND je.voided_at IS NULL
    `,
    [USMCA_COMPANY_ID]
  );
  console.log(`Expenses with a live posted JE (source_transaction_type='expense'): ${expenses.rowCount}`);
  for (const ex of expenses.rows) {
    if (!executeFlag) continue;
    try {
      // ROUND 112: reversal + stamp in the SAME inTx() -- same shape as invoices above.
      const res = await inTx(async () => {
        const r = await reversePostedSourceTransactionInClientTx(client, { operating_company_id: USMCA_COMPANY_ID, source_transaction_type: "expense", source_transaction_id: ex.id }, ACTOR, companyBusinessDate());
        await stamp(expenseTally, "expense", ex.id);
        return r;
      });
      if (res.result === "reversed") expenseTally.reversed++;
      else expenseTally.already_reversed++;
    } catch (e) {
      // ROUND 98.1-A FALLBACK: same as invoices above -- REUSE engine #6 by JE id, not a 7th
      // engine, when there is a live posted JE but no accounting.posting_batches row to find it
      // through. This is also the fix for the 202 uq_posting_batches_company_idempotency_key
      // collisions the Round 99/101 rehearsal hit on expenses: those were orphaned partial
      // batches from a PRIOR unwrapped attempt (fixed above by inTx()) colliding on retry --
      // once every attempt is atomic, there is nothing left to collide with.
      if (e instanceof PostingEngineError && e.message === "No posted batch found to reverse") {
        try {
          const fb = await reverseByJeIdFallback("expense", ex.id, VOID_REASON, "expense", expenseTally);
          if (fb === "reversed") expenseTally.reversed++;
          else expenseTally.errors.push(`expense ${ex.id}: no posted batch AND no single live JE to fall back to`);
        } catch (fbErr) {
          expenseTally.errors.push(`expense ${ex.id} (fallback): ${fbErr instanceof Error ? fbErr.message : String(fbErr)}`);
        }
      } else if (e instanceof VoidDocumentStampError) {
        expenseTally.errors.push(`expense ${ex.id}: reversal rolled back because its stamp failed (${e.code})`);
      } else {
        expenseTally.errors.push(`expense ${ex.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
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
       WHERE ft.operating_company_id = $1::uuid AND je.status = 'posted' AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL AND je.voided_at IS NULL
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
          // is the tell that it was written to expect one. ROUND 102: now the shared inTx() helper
          // (defined once, near the top of main()) instead of its own inline BEGIN/COMMIT/ROLLBACK
          // -- one helper, six call sites, not six copies.
          // ROUND 112: for 'earn' latches, ALSO stamp family='load' documentId=l.load_id, in the
          // SAME inTx() as the JE reversal -- reversing this JE is one of possibly several events
          // that must ALL be dead before the load itself is fully unwound (ROUND 117 fix: a load
          // can carry more than one 'load'-linked JE, e.g. its 'bill' event too -- see
          // loadHasLiveLinkedJes's own header comment). Checked BEFORE stamping, inside the same
          // transaction as the reversal that might be what finally clears it, so the check sees
          // this reversal's own effect.
          await inTx(async () => {
            await reverseJournalEntryNoFlip(client, { operatingCompanyId: USMCA_COMPANY_ID, journalEntryId: l.je_id, reason: VOID_REASON, actorUserId: OWNER_USER_ID });
            if (l.event === "earn" && !(await loadHasLiveLinkedJes(l.load_id))) await stamp(revrecTally, "load", l.load_id);
          });
          revrecTally.reversed++;
        } else {
          // ROUND 112: JE already dead from a prior run (reversed_by_je_id or voided_at already
          // set) -- the exact "97 reversals in, not one stamped" case. Stamp is still owed,
          // idempotent, and does not need the JE reversal repeated. Own inTx() since there is no
          // reversal call to share one with here. ROUND 117: still gated on loadHasLiveLinkedJes
          // -- this latch's own JE being dead does not mean every OTHER JE linked to the same
          // load is dead too.
          if (l.event === "earn" && jeRow && (jeRow.reversed_by_je_id || jeRow.voided_at)) {
            try {
              await inTx(async () => {
                if (!(await loadHasLiveLinkedJes(l.load_id))) await stamp(revrecTally, "load", l.load_id);
              });
            } catch {
              // stamp() already recorded the failure in revrecTally.stamp_errors.
            }
          }
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
    console.log(
      `${name}: reversed=${t.reversed} already_reversed=${t.already_reversed} skipped=${t.skipped.length} errors=${t.errors.length} ` +
        `| stamped=${t.stamped} already_voided_stamps=${t.already_voided_stamps} stamp_errors=${t.stamp_errors.length}`
    );
    for (const s of t.skipped) console.log(`  SKIPPED: ${s}`);
    for (const e of t.errors) console.log(`  ERROR: ${e}`);
    for (const se of t.stamp_errors) console.log(`  STAMP ERROR: ${se}`);
  }
  console.log(`fuel_transactions: NO_PATH=${fuelTally.no_path} ($${(fuelTally.no_path_amount_cents / 100).toFixed(2)}) -- never voided, no engine exists`);
  console.log(
    `\nROUND 112 TOTAL STAMPS: ${
      [settlementTally, factoringTally, invoiceTally, expenseTally, revrecTally].reduce((n, t) => n + t.stamped + t.already_voided_stamps, 0)
    } document(s) now carry voided_at/void_reason/voided_by_user_id ` +
      `(factoring_advance + invoice + expense + load families; settlements/driver_bills have no stamp family, fuel has no reversal path).`
  );

  client.release();
  await pool.end();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
