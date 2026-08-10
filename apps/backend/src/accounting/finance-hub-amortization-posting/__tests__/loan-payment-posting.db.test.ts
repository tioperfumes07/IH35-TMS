/**
 * FH-3 — loan-payment GL posting (real Postgres). Proves:
 *   (a) flag OFF -> the poster is a NO-OP (zero journal-entry lines).
 *   (b) flag ON  -> ONE balanced 3-leg entry per due payment
 *                   (Dr Note Payable principal + Dr Interest Expense / Cr cash payment),
 *                   the schedule rows latch to their JE, and a re-run posts nothing (idempotent).
 *   (c) only DUE payments post — a future due_date stays unposted.
 *   (d) accounts missing -> REFUSED (ACCOUNT_MISSING), zero journal-entry lines (fail CLOSED).
 *   (e) reversal -> reversing JE posted + schedule rows un-latched; re-run reverses nothing.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { postLoanPayments, reverseLoanPayments, type LoanPaymentPostingResult } from "../loan-payment-posting.service.js";
import { LoanPaymentPostingError } from "../loan-payment-posting.math.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("FH-3 loan-payment GL posting (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  // Dedicated, UNIQUE actor for THIS file only (see setFlag): the flag override is USER-scoped so a
  // sibling *.db.test.ts toggling the same flag on the shared TRANSP company cannot clobber it.
  const userId = "00000000-0000-4000-8000-0000000000e7";

  const acct = {
    notePayable: randomUUID(),
    interestExpense: randomUUID(),
    cash: randomUUID(),
  };
  const loanIds: string[] = [];

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) {
      await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
      await db.query("SELECT set_config('app.current_operating_company_id', $1::text, true)", [companyId]);
    }
    try { await fn(); await db.query("COMMIT"); }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  async function scopedRead<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    await db.query("SELECT set_config('app.current_operating_company_id', $1::text, true)", [companyId]);
    try { const r = await db.query(sql, params); await db.query("COMMIT"); return r.rows as T[]; }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  async function setFlag(enabled: boolean) {
    await bypass(async () => {
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ('FINANCE_HUB_AMORTIZATION_POST_ENABLED', $1::uuid, $2::uuid, $3, $2::uuid)
         ON CONFLICT (flag_key, user_uuid) WHERE user_uuid IS NOT NULL DO UPDATE SET enabled = EXCLUDED.enabled`,
        [companyId, userId, enabled]
      );
    });
  }

  /**
   * Seed a loan + its schedule rows. `rows` carry the ALREADY-COMPUTED split (that is the FH-3 engine's
   * job); this poster only assembles them, so the fixture states the split explicitly.
   */
  async function seedLoan(opts: {
    withAccounts: boolean;
    withInterestAccount?: boolean;
    rows: Array<{ dueDate: string; principal: number; interest: number }>;
  }): Promise<string> {
    const id = randomUUID();
    const total = opts.rows.reduce((s, r) => s + r.principal, 0);
    await bypass(async () => {
      await db.query(
        `INSERT INTO finance.loans
           (id, operating_company_id, name, lender, original_principal_cents, interest_rate_bps,
            term_months, first_payment_date, gl_liability_account_id, gl_interest_expense_account_id,
            payment_account_id, created_by_user_id, updated_by_user_id)
         VALUES ($1::uuid,$2::uuid,$3,'FH3 Lender',$4,650,$5,$6::date,$7,$8,$9,$10::uuid,$10::uuid)`,
        [
          id, companyId, `FH3 loan ${suffix}-${loanIds.length}`, total, opts.rows.length,
          opts.rows[0]!.dueDate,
          opts.withAccounts ? acct.notePayable : null,
          opts.withAccounts && opts.withInterestAccount !== false ? acct.interestExpense : null,
          opts.withAccounts ? acct.cash : null,
          userId,
        ]
      );
      let balance = total;
      for (const [i, r] of opts.rows.entries()) {
        balance -= r.principal;
        await db.query(
          `INSERT INTO finance.loan_amortization_rows
             (operating_company_id, loan_id, payment_number, due_date, payment_cents,
              principal_cents, interest_cents, remaining_balance_cents, created_by_user_id, updated_by_user_id)
           VALUES ($1::uuid,$2::uuid,$3,$4::date,$5,$6,$7,$8,$9::uuid,$9::uuid)`,
          [companyId, id, i + 1, r.dueDate, r.principal + r.interest, r.principal, r.interest, balance, userId]
        );
      }
    });
    loanIds.push(id);
    return id;
  }

  async function jeLineCount(loanId: string): Promise<number> {
    const r = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entry_postings
        WHERE source_transaction_id = $1 AND source_transaction_type = 'loan_payment'`,
      [loanId]
    );
    return Number(r[0]!.c);
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await bypass(async () => {
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [userId, `fh3-loan-${suffix}@test.local`]
      );
      const mk = async (id: string, n: string, type: string) =>
        db.query(
          `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
           VALUES ($1::uuid,$2::uuid,$3,$4,$5,true)`,
          [id, companyId, `${n}${suffix}`, `FH3 ${n}`, type]
        );
      await mk(acct.notePayable, "NOTEPAY", "Liability");
      await mk(acct.interestExpense, "INTEXP", "Expense");
      await mk(acct.cash, "FH3CASH", "Asset");
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        const rowIds = (
          await db.query<{ id: string }>(`SELECT id::text FROM finance.loan_amortization_rows WHERE loan_id = ANY($1::uuid[])`, [loanIds])
        ).rows.map((r) => r.id);
        await db.query(`DELETE FROM accounting.transaction_source_links WHERE linked_object_id = ANY($1)`, [[...loanIds, ...rowIds]]);
        await db.query(`DELETE FROM accounting.journal_entry_postings WHERE source_transaction_id = ANY($1) AND source_transaction_type = 'loan_payment'`, [loanIds]);
        await db.query(`UPDATE finance.loan_amortization_rows SET posted_journal_entry_id = NULL WHERE loan_id = ANY($1::uuid[])`, [loanIds]);
        await db.query(`DELETE FROM accounting.journal_entries WHERE operating_company_id=$1::uuid AND memo LIKE $2`, [companyId, `%${suffix}%`]);
        await db.query(`DELETE FROM finance.loan_amortization_rows WHERE loan_id = ANY($1::uuid[])`, [loanIds]);
        await db.query(`DELETE FROM finance.loans WHERE id = ANY($1::uuid[])`, [loanIds]);
        await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [Object.values(acct)]);
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key='FINANCE_HUB_AMORTIZATION_POST_ENABLED' AND operating_company_id=$1::uuid`, [companyId]);
      });
    } catch { /* best-effort */ }
    await db.end();
  });

  it("(a) flag OFF -> no-op, zero journal-entry lines", async () => {
    await setFlag(false);
    const loanId = await seedLoan({ withAccounts: true, rows: [{ dueDate: "2026-02-01", principal: 80000, interest: 5000 }] });
    const res = (await postLoanPayments({ operatingCompanyId: companyId, loanId, runDate: "2030-01-01" }, { userId })) as LoanPaymentPostingResult;
    expect(res.result).toBe("skipped_flag_off");
    expect(await jeLineCount(loanId)).toBe(0);
  });

  it("(b) flag ON -> balanced 3-leg entry per due payment, rows latched, idempotent", async () => {
    await setFlag(true);
    const loanId = await seedLoan({
      withAccounts: true,
      rows: [
        { dueDate: "2026-02-01", principal: 80000, interest: 5000 },
        { dueDate: "2026-03-01", principal: 81000, interest: 4000 },
      ],
    });
    const res = (await postLoanPayments({ operatingCompanyId: companyId, loanId, runDate: "2030-01-01" }, { userId })) as Extract<
      LoanPaymentPostingResult,
      { result: "posted" }
    >;
    expect(res.result).toBe("posted");
    expect(res.payment_count).toBe(2);
    expect(res.total_principal_cents).toBe(161000);
    expect(res.total_interest_cents).toBe(9000);
    expect(res.total_paid_cents).toBe(170000);

    // 3 legs x 2 payments, and debits == credits (balanced).
    expect(await jeLineCount(loanId)).toBe(6);
    const sums = await scopedRead<{ dr: string; cr: string }>(
      `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='debit'),0)::text AS dr,
              COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='credit'),0)::text AS cr
         FROM accounting.journal_entry_postings
        WHERE source_transaction_id=$1 AND source_transaction_type='loan_payment'`,
      [loanId]
    );
    expect(Number(sums[0]!.dr)).toBe(170000);
    expect(Number(sums[0]!.cr)).toBe(170000);

    // Each leg lands on its designated account with the stored split amount.
    const byAccount = await scopedRead<{ account_id: string; debit_or_credit: string; total: string }>(
      `SELECT account_id::text, debit_or_credit, SUM(amount_cents)::text AS total
         FROM accounting.journal_entry_postings
        WHERE source_transaction_id=$1 AND source_transaction_type='loan_payment'
        GROUP BY 1,2`,
      [loanId]
    );
    const leg = (id: string) => byAccount.find((r) => r.account_id === id)!;
    expect(leg(acct.notePayable).debit_or_credit).toBe("debit");
    expect(Number(leg(acct.notePayable).total)).toBe(161000);
    expect(leg(acct.interestExpense).debit_or_credit).toBe("debit");
    expect(Number(leg(acct.interestExpense).total)).toBe(9000);
    expect(leg(acct.cash).debit_or_credit).toBe("credit");
    expect(Number(leg(acct.cash).total)).toBe(170000);

    // Schedule rows latched to their JE; loan retired once nothing is left unposted.
    const rows = await scopedRead<{ posted: boolean; posted_journal_entry_id: string | null }>(
      `SELECT posted, posted_journal_entry_id::text FROM finance.loan_amortization_rows
        WHERE loan_id=$1::uuid ORDER BY payment_number`,
      [loanId]
    );
    expect(rows.every((r) => r.posted && r.posted_journal_entry_id)).toBe(true);
    const loan = await scopedRead<{ status: string }>(`SELECT status FROM finance.loans WHERE id=$1::uuid`, [loanId]);
    expect(loan[0]!.status).toBe("paid_off");

    // Both grains linked (loan + the specific schedule row).
    const links = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.transaction_source_links WHERE linked_object_id=$1`,
      [loanId]
    );
    expect(Number(links[0]!.c)).toBeGreaterThanOrEqual(6);

    // Idempotent: re-run posts nothing and does NOT double the ledger.
    const rerun = (await postLoanPayments({ operatingCompanyId: companyId, loanId, runDate: "2030-01-01" }, { userId })) as LoanPaymentPostingResult;
    expect(rerun.result).toBe("nothing_to_post");
    expect(await jeLineCount(loanId)).toBe(6);
  });

  it("(c) only DUE payments post — a future due_date stays unposted", async () => {
    await setFlag(true);
    const loanId = await seedLoan({
      withAccounts: true,
      rows: [
        { dueDate: "2026-02-01", principal: 50000, interest: 1000 },
        { dueDate: "2099-02-01", principal: 50000, interest: 500 },
      ],
    });
    const res = (await postLoanPayments({ operatingCompanyId: companyId, loanId, runDate: "2026-06-01" }, { userId })) as Extract<
      LoanPaymentPostingResult,
      { result: "posted" }
    >;
    expect(res.payment_count).toBe(1);
    expect(await jeLineCount(loanId)).toBe(3);
    const pending = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM finance.loan_amortization_rows WHERE loan_id=$1::uuid AND posted=false`,
      [loanId]
    );
    expect(Number(pending[0]!.c)).toBe(1);
    // Not retired while a payment remains.
    const loan = await scopedRead<{ status: string }>(`SELECT status FROM finance.loans WHERE id=$1::uuid`, [loanId]);
    expect(loan[0]!.status).toBe("active");
  });

  it("(d) missing GL accounts -> REFUSED (ACCOUNT_MISSING), zero journal-entry lines", async () => {
    await setFlag(true);
    const loanId = await seedLoan({ withAccounts: false, rows: [{ dueDate: "2026-02-01", principal: 40000, interest: 900 }] });
    let code: string | null = null;
    try {
      await postLoanPayments({ operatingCompanyId: companyId, loanId, runDate: "2030-01-01" }, { userId });
    } catch (e) {
      code = e instanceof LoanPaymentPostingError ? e.code : `other:${(e as Error).message}`;
    }
    expect(code).toBe("ACCOUNT_MISSING");
    expect(await jeLineCount(loanId)).toBe(0);
  });

  it("(d2) interest charged with no interest-expense account -> REFUSED, zero journal-entry lines", async () => {
    await setFlag(true);
    const loanId = await seedLoan({
      withAccounts: true,
      withInterestAccount: false,
      rows: [{ dueDate: "2026-02-01", principal: 40000, interest: 900 }],
    });
    let code: string | null = null;
    try {
      await postLoanPayments({ operatingCompanyId: companyId, loanId, runDate: "2030-01-01" }, { userId });
    } catch (e) {
      code = e instanceof LoanPaymentPostingError ? e.code : `other:${(e as Error).message}`;
    }
    expect(code).toBe("ACCOUNT_MISSING");
    expect(await jeLineCount(loanId)).toBe(0);
  });

  it("(e) reversal posts a reversing JE + un-latches the rows; re-run reverses nothing", async () => {
    await setFlag(true);
    const loanId = await seedLoan({
      withAccounts: true,
      rows: [
        { dueDate: "2026-02-01", principal: 30000, interest: 700 },
        { dueDate: "2026-03-01", principal: 30000, interest: 600 },
      ],
    });
    const posted = (await postLoanPayments({ operatingCompanyId: companyId, loanId, runDate: "2030-01-01" }, { userId })) as Extract<
      LoanPaymentPostingResult,
      { result: "posted" }
    >;
    expect(posted.payment_count).toBe(2);

    const rev = await reverseLoanPayments({ operatingCompanyId: companyId, loanId, reason: "FH3 test reversal" }, { userId });
    expect(rev.result).toBe("reversed");
    expect(rev.reversed_payments.length).toBe(2);
    expect(rev.reversed_payments.every((p) => p.reversal_journal_entry_id)).toBe(true);

    const unposted = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM finance.loan_amortization_rows WHERE loan_id=$1::uuid AND posted=false`,
      [loanId]
    );
    expect(Number(unposted[0]!.c)).toBe(2);
    // Retirement undone.
    const loan = await scopedRead<{ status: string }>(`SELECT status FROM finance.loans WHERE id=$1::uuid`, [loanId]);
    expect(loan[0]!.status).toBe("active");

    const rev2 = await reverseLoanPayments({ operatingCompanyId: companyId, loanId, reason: "again" }, { userId });
    expect(rev2.result).toBe("nothing_to_reverse");
  });

  it("(f) re-post after a reversal books a NEW live entry, not a re-link to the voided one", async () => {
    await setFlag(true);
    const loanId = await seedLoan({ withAccounts: true, rows: [{ dueDate: "2026-02-01", principal: 20000, interest: 400 }] });
    const first = (await postLoanPayments({ operatingCompanyId: companyId, loanId, runDate: "2030-01-01" }, { userId })) as Extract<
      LoanPaymentPostingResult,
      { result: "posted" }
    >;
    const firstJeId = first.posted_payments[0]!.journal_entry_id;

    await reverseLoanPayments({ operatingCompanyId: companyId, loanId, reason: "correction" }, { userId });

    const second = (await postLoanPayments({ operatingCompanyId: companyId, loanId, runDate: "2030-01-01" }, { userId })) as Extract<
      LoanPaymentPostingResult,
      { result: "posted" }
    >;
    const secondJeId = second.posted_payments[0]!.journal_entry_id;
    // A re-link to the voided entry would report "posted" with zero net GL effect — a phantom payment.
    expect(secondJeId).not.toBe(firstJeId);
    const status = await scopedRead<{ status: string }>(`SELECT status FROM accounting.journal_entries WHERE id=$1::uuid`, [secondJeId]);
    expect(status[0]!.status).toBe("posted");
    // 3 legs voided + 3 legs live under the revision key.
    expect(await jeLineCount(loanId)).toBe(6);
  });
});
