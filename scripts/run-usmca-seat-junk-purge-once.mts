/**
 * USMCA seat-junk purge — owner order 2026-09-01.
 * WORM/void discipline: reverse never delete on money tables. Keep Plaid bank feed.
 *
 * Usage:
 *   DATABASE_DIRECT_URL=postgresql://... npx tsx scripts/run-usmca-seat-junk-purge-once.mts
 *   ... --commit   # executes; default is dry-run inventory only
 */
import pg from "pg";
import { companyBusinessDate } from "../apps/backend/src/lib/company-business-date.ts";
import { executeVoidCancel } from "../apps/backend/src/governance/void-cancel-executors.ts";
import { cancelLoadInClientTx } from "../apps/backend/src/dispatch/cancellation.service.ts";
import {
  voidBillInClientTx,
  voidBillPaymentInClientTx,
  type BillMutationClient,
} from "../apps/backend/src/accounting/bills.service.ts";
import { reverseJournalEntryNoFlip } from "../apps/backend/src/accounting/journal-entries.service.ts";
import { unmatchBankTransactionById } from "../apps/backend/src/accounting/void.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const REASON =
  "OWNER-USMCA-SEAT-JUNK-PURGE-2026-09-01: remove seat test/demo/sample contamination; keep Plaid bank feed";
const COMMIT = process.argv.includes("--commit");

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) {
  throw new Error("REFUSING -pooler URL — use direct Neon endpoint for session GUCs under FORCE RLS");
}

type Client = pg.PoolClient;

async function glFingerprint(c: Client, realOnly: boolean): Promise<string> {
  const sampleFilter = realOnly ? "AND COALESCE(je.is_sample_data, false) = false" : "";
  const r = await c.query<{ fp: string }>(
    `
      SELECT coalesce(
        md5(string_agg(account_id::text || ':' || net::text, '|' ORDER BY account_id::text)),
        'empty'
      ) AS fp
      FROM (
        SELECT p.account_id,
               sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END)::bigint AS net
          FROM accounting.journal_entry_postings p
          JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
         WHERE je.operating_company_id = $1::uuid
           AND je.status <> 'voided'
           ${sampleFilter}
         GROUP BY p.account_id
      ) s
    `,
    [USMCA]
  );
  return r.rows[0]?.fp ?? "empty";
}

async function printInventory(c: Client) {
  const q = await c.query<{ label: string; n: string }>(
    `
      SELECT * FROM (
        SELECT 'loads_active' AS label, count(*)::text AS n FROM mdata.loads
          WHERE operating_company_id = $1::uuid AND soft_deleted_at IS NULL
        UNION ALL SELECT 'loads_sample', count(*)::text FROM mdata.loads
          WHERE operating_company_id = $1::uuid AND is_sample_data AND soft_deleted_at IS NULL
        UNION ALL SELECT 'bills_unvoided', count(*)::text FROM accounting.bills
          WHERE operating_company_id = $1::uuid AND revoked_at IS NULL AND status <> 'voided'
        UNION ALL SELECT 'expenses_unvoided', count(*)::text FROM accounting.expenses
          WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND status <> 'void'
        UNION ALL SELECT 'invoices_unvoided', count(*)::text FROM accounting.invoices
          WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND status <> 'void'
        UNION ALL SELECT 'payments_unvoided', count(*)::text FROM accounting.payments
          WHERE operating_company_id = $1::uuid AND voided_at IS NULL
        UNION ALL SELECT 'bill_payments_active', count(*)::text FROM accounting.bill_payments
          WHERE operating_company_id = $1::uuid AND revoked_at IS NULL
        UNION ALL SELECT 'settlements_open', count(*)::text FROM driver_finance.driver_settlements
          WHERE operating_company_id = $1::uuid AND status NOT IN ('cancelled','paid')
        UNION ALL SELECT 'jes_active_sample', count(*)::text FROM accounting.journal_entries
          WHERE operating_company_id = $1::uuid AND is_sample_data AND status <> 'voided'
        UNION ALL SELECT 'bank_plaid_active', count(*)::text FROM banking.bank_transactions
          WHERE operating_company_id = $1::uuid AND source = 'plaid' AND voided_at IS NULL
        UNION ALL SELECT 'bank_fake_active', count(*)::text FROM banking.bank_transactions
          WHERE operating_company_id = $1::uuid AND source IS DISTINCT FROM 'plaid' AND voided_at IS NULL
        UNION ALL SELECT 'insurance_policies', count(*)::text FROM insurance.policy
          WHERE operating_company_id = $1::uuid
        UNION ALL SELECT 'claims', count(*)::text FROM insurance.claim
          WHERE operating_company_id = $1::uuid
      ) x ORDER BY label
    `,
    [USMCA]
  );
  console.log("INVENTORY (USMCA):");
  for (const row of q.rows) console.log(`  ${row.label}: ${row.n}`);
}

async function reopenReconciledSessionIfNeeded(c: Client, txnId: string): Promise<void> {
  const r = await c.query<{ session_id: string }>(
    `
      SELECT rs.id::text AS session_id
        FROM banking.bank_transactions bt
        JOIN banking.reconciliation_sessions rs ON rs.id = bt.reconciliation_session_id
       WHERE bt.id = $1::uuid
         AND bt.operating_company_id = $2::uuid
         AND rs.status = 'reconciled'
       LIMIT 1
    `,
    [txnId, USMCA]
  );
  const sessionId = r.rows[0]?.session_id;
  if (!sessionId) return;

  await c.query(
    `
      UPDATE banking.reconciliation_sessions
         SET status = 'reopened',
             reopened_at = now(),
             reopened_by_user_id = $3::uuid,
             reopen_reason = $4,
             updated_at = now()
       WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status = 'reconciled'
    `,
    [sessionId, USMCA, ACTOR, REASON]
  );
  await c.query(
    `
      UPDATE banking.reconciliation_sessions
         SET status = 'voided',
             voided_at = now(),
             voided_by_user_id = $3::uuid,
             void_reason = $4,
             updated_at = now()
       WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status = 'reopened'
    `,
    [sessionId, USMCA, ACTOR, REASON]
  );
  await c.query(
    `UPDATE banking.bank_transactions
        SET reconciliation_session_id = NULL, reconciliation_cleared = false, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [txnId, USMCA]
  );
}

async function voidFakeBankTxns(c: Client): Promise<number> {
  const rows = await c.query<{ id: string }>(
    `
      SELECT id::text AS id
        FROM banking.bank_transactions
       WHERE operating_company_id = $1::uuid
         AND voided_at IS NULL
         AND source IS DISTINCT FROM 'plaid'
       ORDER BY transaction_date, id
    `,
    [USMCA]
  );
  let n = 0;
  for (const { id } of rows.rows) {
    await reopenReconciledSessionIfNeeded(c, id);
    try {
      await unmatchBankTransactionById(c, USMCA, id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("IH35_RECONCILED_SESSION")) throw err;
      console.log(`  bank ${id}: skip unmatch (still reconciled)`);
    }
    const u = await c.query(
      `UPDATE banking.bank_transactions
          SET voided_at = now(), voided_reason = $3, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL
        RETURNING id`,
      [id, USMCA, REASON]
    );
    if (u.rowCount) n += 1;
  }
  return n;
}

async function voidSettlements(c: Client): Promise<{ ok: number; skip: number }> {
  const rows = await c.query<{ id: string; status: string }>(
    `
      SELECT id::text, status::text
        FROM driver_finance.driver_settlements
       WHERE operating_company_id = $1::uuid
         AND status NOT IN ('cancelled')
       ORDER BY created_at
    `,
    [USMCA]
  );
  let ok = 0;
  let skip = 0;
  for (const row of rows.rows) {
    if (row.status === "paid") {
      skip += 1;
      console.log(`  settlement ${row.id} SKIP paid`);
      continue;
    }
    const res = await executeVoidCancel("driver_settlement", {
      client: c,
      operatingCompanyId: USMCA,
      entityId: row.id,
      action: "void",
      userId: ACTOR,
      reason: REASON,
    });
    if (res.kind === "ok" || res.kind === "already_done") ok += 1;
    else {
      skip += 1;
      console.log(`  settlement ${row.id} FAIL ${res.kind}`);
    }
  }
  return { ok, skip };
}

async function voidOpenDriverBills(c: Client): Promise<number> {
  const r = await c.query(
    `
      UPDATE driver_finance.driver_bills
         SET status = 'void', updated_at = now()
       WHERE operating_company_id = $1::uuid
         AND status = 'open'
       RETURNING id
    `,
    [USMCA]
  );
  return r.rowCount ?? 0;
}

async function voidFinancialDocs(c: Client): Promise<void> {
  const biz = companyBusinessDate();
  let step = 0;
  const tick = (label: string) => {
    step += 1;
    if (step % 5 === 0 || step === 1) console.log(`  … ${label} (${step} items)`);
  };

  const billPayments = await c.query<{ id: string }>(
    `SELECT id::text FROM accounting.bill_payments
      WHERE operating_company_id = $1::uuid AND revoked_at IS NULL AND is_sample_data = true`,
    [USMCA]
  );
  for (const { id } of billPayments.rows) {
    tick(`bill_payment ${id}`);
    try {
      await voidBillPaymentInClientTx(c as unknown as BillMutationClient, {
        operatingCompanyId: USMCA,
        paymentId: id,
        reason: REASON,
        userId: ACTOR,
        currentBusinessDate: biz,
        reversePostedGl: true,
      });
    } catch (e) {
      console.log(`  bill_payment ${id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  const payments = await c.query<{ id: string }>(
    `SELECT id::text FROM accounting.payments
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND is_sample_data = true`,
    [USMCA]
  );
  for (const { id } of payments.rows) {
    tick(`payment ${id}`);
    const res = await executeVoidCancel("payment", {
      client: c,
      operatingCompanyId: USMCA,
      entityId: id,
      action: "void",
      userId: ACTOR,
      reason: REASON,
    });
    if (res.kind !== "ok" && res.kind !== "already_done") {
      console.log(`  payment ${id}: ${res.kind}`);
    }
  }

  const invoices = await c.query<{ id: string; status: string }>(
    `SELECT id::text, status::text FROM accounting.invoices
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND status <> 'void'
        AND is_sample_data = true`,
    [USMCA]
  );
  for (const row of invoices.rows) {
    tick(`invoice ${row.id}`);
    const res = await executeVoidCancel("invoice", {
      client: c,
      operatingCompanyId: USMCA,
      entityId: row.id,
      action: "void",
      userId: ACTOR,
      reason: REASON,
    });
    if (res.kind !== "ok" && res.kind !== "already_done") {
      console.log(`  invoice ${row.id} (${row.status}): ${res.kind}`);
    }
  }

  const expenses = await c.query<{ id: string }>(
    `SELECT id::text FROM accounting.expenses
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND status <> 'void'
        AND is_sample_data = true`,
    [USMCA]
  );
  for (const { id } of expenses.rows) {
    tick(`expense ${id}`);
    const res = await executeVoidCancel("expense", {
      client: c,
      operatingCompanyId: USMCA,
      entityId: id,
      action: "void",
      userId: ACTOR,
      reason: REASON,
    });
    if (res.kind !== "ok" && res.kind !== "already_done") {
      console.log(`  expense ${id}: ${res.kind}`);
    }
  }

  const bills = await c.query<{ id: string }>(
    `SELECT id::text FROM accounting.bills
      WHERE operating_company_id = $1::uuid AND revoked_at IS NULL AND status <> 'voided'
        AND is_sample_data = true`,
    [USMCA]
  );
  for (const { id } of bills.rows) {
    tick(`bill ${id}`);
    try {
      await voidBillInClientTx(c as unknown as BillMutationClient, {
        operatingCompanyId: USMCA,
        billId: id,
        reason: REASON,
        userId: ACTOR,
        currentBusinessDate: biz,
      });
    } catch (e) {
      console.log(`  bill ${id}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

async function reverseSampleJes(c: Client): Promise<number> {
  const rows = await c.query<{ id: string }>(
    `
      SELECT id::text AS id
        FROM accounting.journal_entries
       WHERE operating_company_id = $1::uuid
         AND is_sample_data = true
         AND status = 'posted'
         AND reversed_by_je_id IS NULL
       ORDER BY entry_date, id
    `,
    [USMCA]
  );
  let n = 0;
  for (const { id } of rows.rows) {
    try {
      await reverseJournalEntryNoFlip(c, {
        operatingCompanyId: USMCA,
        journalEntryId: id,
        reason: REASON,
        actorUserId: ACTOR,
      });
      n += 1;
    } catch (e) {
      console.log(`  JE ${id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return n;
}

async function cancelLoads(c: Client): Promise<number> {
  const rows = await c.query<{ id: string; load_number: string }>(
    `
      SELECT id::text, load_number
        FROM mdata.loads
       WHERE operating_company_id = $1::uuid
         AND soft_deleted_at IS NULL
         AND status NOT IN ('cancelled')
       ORDER BY created_at
    `,
    [USMCA]
  );
  let n = 0;
  for (const row of rows.rows) {
    try {
      await cancelLoadInClientTx(c, ACTOR, "Owner", {
        operating_company_id: USMCA,
        load_id: row.id,
        reason_code: "CUST_NO_LONGER_NEEDED",
        cancellation_notes: `${REASON} — purge seat test load ${row.load_number}`,
        billable_to_customer: false,
      });
      n += 1;
    } catch (e) {
      console.log(`  load ${row.load_number}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return n;
}

async function cancelTestInsurance(c: Client): Promise<number> {
  const r = await c.query(
    `
      UPDATE insurance.policy
         SET status = 'cancelled',
             cancel_reason = $2,
             cancelled_on = current_date,
             updated_at = now()
       WHERE operating_company_id = $1::uuid
         AND status <> 'cancelled'
         AND (
           policy_number ILIKE 'SAMPLE%'
           OR policy_number ILIKE 'TEST%'
           OR policy_number ILIKE 'POL-TEST%'
         )
       RETURNING policy_number
    `,
    [USMCA, REASON]
  );
  return r.rowCount ?? 0;
}

const pool = new pg.Pool({
  connectionString: url.replace("-pooler.", "."),
  ssl: { rejectUnauthorized: false },
});
const client = await pool.connect();

try {
  await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
  const who = await client.query<{ u: string }>(`SELECT current_user AS u`);
  console.log(`current_user=${who.rows[0].u} commit=${COMMIT}`);

  await printInventory(client);
  const fpRealBefore = await glFingerprint(client, true);
  const fpAllBefore = await glFingerprint(client, false);
  console.log(`GL fingerprint REAL-only BEFORE: ${fpRealBefore}`);
  console.log(`GL fingerprint ALL BEFORE: ${fpAllBefore}`);

  if (!COMMIT) {
    console.log("DRY RUN — pass --commit to execute purge.");
    process.exit(0);
  }

  /** Commit each phase separately so partial progress survives failures / aborts. */
  async function runPhase(label: string, fn: () => Promise<void>): Promise<void> {
    console.log(label);
    await client.query("BEGIN");
    try {
      await fn();
      const fpNow = await glFingerprint(client, true);
      if (fpRealBefore !== fpNow) {
        throw new Error(
          `REAL GL fingerprint changed in ${label} (before=${fpRealBefore} now=${fpNow})`
        );
      }
      await client.query("COMMIT");
      console.log(`  ✓ ${label} committed (REAL GL unchanged)`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }

  await runPhase("Phase 1: void fake bank txns (keep plaid)...", async () => {
    console.log(`  voided ${await voidFakeBankTxns(client)} bank rows`);
  });

  await runPhase("Phase 2: cancel settlements...", async () => {
    console.log(`  ${JSON.stringify(await voidSettlements(client))}`);
  });

  await runPhase("Phase 3: void financial documents...", async () => {
    await voidFinancialDocs(client);
  });

  await runPhase("Phase 3b: void open driver bills...", async () => {
    console.log(`  voided ${await voidOpenDriverBills(client)} driver bills`);
  });

  await runPhase("Phase 4: reverse active sample JEs...", async () => {
    console.log(`  reversed ${await reverseSampleJes(client)} JEs`);
  });

  await runPhase("Phase 5: cancel loads...", async () => {
    console.log(`  cancelled ${await cancelLoads(client)} loads`);
  });

  await runPhase("Phase 6: cancel test insurance policies...", async () => {
    console.log(`  cancelled ${await cancelTestInsurance(client)} policies`);
  });

  const fpRealAfter = await glFingerprint(client, true);
  const fpAllAfter = await glFingerprint(client, false);
  console.log(`GL fingerprint REAL-only AFTER: ${fpRealAfter}`);
  console.log(`GL fingerprint ALL AFTER: ${fpAllAfter}`);
  console.log("PURGE COMPLETE — REAL GL fingerprint unchanged throughout.");

  await printInventory(client);
} finally {
  client.release();
  await pool.end();
}
