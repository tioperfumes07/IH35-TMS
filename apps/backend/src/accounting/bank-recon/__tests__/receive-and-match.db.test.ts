/**
 * ROUND 433 B8 — one bank DEPOSIT received against several invoices, end to end on real Postgres.
 *
 * Proves receivePaymentsAndMatch (receive-and-match.service.ts) on an isolated company with its own fake ids:
 *   - one customer payment per customer, deposited to the bank line's ledger account, pointing back at the line
 *     (payment_source_kind 'bank_feed_match', source_bank_transaction_id);
 *   - payment_applications against each selected invoice, and the invoices' open balances move;
 *   - one live reconciliation match per payment, the line matched (matched_payment_id);
 *   - GL: every payment posts Dr bank / Cr A/R, balanced, and Dr bank totals the deposit;
 *   - a remainder to a named difference account posts Dr bank / Cr that account, so the bank side equals the line;
 *   - an over-application is refused and leaves NOTHING behind (no payment, no application, no match, no posting).
 * Runs where a migrated Postgres is available (GITHUB_ACTIONS=true — CI, or scripts/verify-local-ci.mjs locally).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { createIsolatedOperatingCompany, ensureIntegrationPrerequisites, type IsolatedOperatingCompany } from "../../../../test-helpers/db-fixture.js";
import { receivePaymentsAndMatch } from "../receive-and-match.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("ROUND 433 B8 receive one deposit against several invoices (real Postgres)", () => {
  let db: pg.Client;
  let isolated: IsolatedOperatingCompany;
  let companyId: string;
  const suffix = randomUUID().slice(0, 6);
  const digits = String(parseInt(suffix, 16) % 10000).padStart(4, "0");
  const userId = randomUUID();
  const custA = randomUUID();
  const custB = randomUUID();
  const invA1 = randomUUID();
  const invA2 = randomUUID();
  const invB1 = randomUUID();
  const bankGl = randomUUID();
  const arGl = randomUUID();
  const miscGl = randomUUID();
  const bankAccountId = randomUUID();

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      const out = await fn();
      await db.query("COMMIT");
      return out;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }
  const read = <T = Record<string, unknown>>(sql: string, params: unknown[]) => bypass(async () => (await db.query(sql, params)).rows as T[]);

  async function seedDeposit(amountCents: number): Promise<string> {
    const id = randomUUID();
    await bypass(() =>
      db.query(
        `INSERT INTO banking.bank_transactions (id, bank_account_id, operating_company_id, transaction_date, amount_cents, is_credit, status, description)
         VALUES ($1::uuid,$2::uuid,$3::uuid, CURRENT_DATE, $4, true, 'pending_categorization', 'B8 deposit')`,
        [id, bankAccountId, companyId, amountCents]
      )
    );
    return id;
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(`INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Accountant','en') ON CONFLICT (id) DO NOTHING`, [userId, `b8-${suffix}@test.local`]);
    await db.query("COMMIT");
    isolated = await createIsolatedOperatingCompany({ codePrefix: "BEH", legalNamePrefix: "B8 Receive Fixture", label: "receive-and-match", actorUserId: userId, client: db });
    companyId = isolated.companyId;

    await bypass(async () => {
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, account_subtype, is_postable) VALUES
           ($1::uuid,$4::uuid,$5,'B8 Bank','Asset','Bank',true),
           ($2::uuid,$4::uuid,$6,'B8 A/R','Asset','AccountsReceivable',true),
           ($3::uuid,$4::uuid,$7,'B8 Misc income','Income','OtherIncome',true)`,
        [bankGl, arGl, miscGl, companyId, `B8B${suffix}`, `B8A${suffix}`, `B8M${suffix}`]
      );
      await db.query(`INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active) VALUES ($1::uuid,'ar_control',$2::uuid,true)
                        ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE SET account_id = EXCLUDED.account_id`, [companyId, arGl]);
      await db.query(`INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id, is_active, current_balance_cents) VALUES ($1::uuid,$2::uuid,'B8 Bank',$3::uuid,true,0)`, [bankAccountId, companyId, bankGl]);
      await db.query(`INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$3::uuid,'B8 Customer A'),($2::uuid,$3::uuid,'B8 Customer B')`, [custA, custB, companyId]);
      for (const [id, cust, n, cents] of [[invA1, custA, "1", 60000], [invA2, custA, "2", 15000], [invB1, custB, "3", 50000]] as const) {
        await db.query(
          `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, due_date, total_cents, status)
           VALUES ($1::uuid,$2::uuid,$3::uuid,$4, CURRENT_DATE + 30, $5, 'sent')`,
          [id, companyId, cust, `INV-2026-${n}${digits}`, cents]
        );
      }
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, user_uuid, enabled, set_by_user_uuid) VALUES ('CUSTOMER_PAYMENT_GL_POSTING_ENABLED',$1::uuid,true,$1::uuid)
         ON CONFLICT (flag_key, user_uuid) WHERE user_uuid IS NOT NULL DO UPDATE SET enabled = true`,
        [userId]
      );
    });
  });

  afterAll(async () => {
    await db?.end().catch(() => {});
  });

  it("one deposit of 1,050.00 -> two customers' payments, three invoice applications, one matched line, balanced GL", async () => {
    const line = await seedDeposit(105000);
    const r = await receivePaymentsAndMatch({
      operating_company_id: companyId,
      bank_transaction_id: line,
      actor_user_uuid: userId,
      applications: [
        { invoice_id: invA1, amount_cents: 60000 },
        { invoice_id: invA2, amount_cents: 10000 },
        { invoice_id: invB1, amount_cents: 35000 },
      ],
    });
    expect(r.payments).toHaveLength(2);
    expect(r.remainder_cents).toBe(0);

    const pays = await read<{ id: string; customer_id: string; amount_cents: number; deposited_to_account_id: string; payment_source_kind: string; source_bank_transaction_id: string }>(
      `SELECT id::text, customer_id::text, amount_cents::int, deposited_to_account_id::text, payment_source_kind, source_bank_transaction_id::text
         FROM accounting.payments WHERE operating_company_id = $1::uuid AND source_bank_transaction_id = $2::uuid ORDER BY amount_cents DESC`,
      [companyId, line]
    );
    expect(pays.map((p) => [p.customer_id, p.amount_cents])).toEqual([[custA, 70000], [custB, 35000]]);
    for (const p of pays) {
      expect(p.deposited_to_account_id).toBe(bankGl);
      expect(p.payment_source_kind).toBe("bank_feed_match");
    }

    const apps = await read<{ invoice_id: string; amount_cents: number }>(
      `SELECT invoice_id::text, amount_cents::int FROM accounting.payment_applications WHERE payment_id = ANY($1::uuid[]) AND unapplied_at IS NULL ORDER BY amount_cents DESC`,
      [pays.map((p) => p.id)]
    );
    expect(apps).toEqual([{ invoice_id: invA1, amount_cents: 60000 }, { invoice_id: invB1, amount_cents: 35000 }, { invoice_id: invA2, amount_cents: 10000 }]);
    const open = await read<{ id: string; amount_open_cents: number }>(`SELECT id::text, amount_open_cents::int FROM accounting.invoices WHERE id = ANY($1::uuid[])`, [[invA1, invA2, invB1]]);
    expect(Object.fromEntries(open.map((o) => [o.id, o.amount_open_cents]))).toEqual({ [invA1]: 0, [invA2]: 5000, [invB1]: 15000 });

    const matches = await read<{ ledger_entry_id: string }>(
      `SELECT ledger_entry_id::text FROM banking.reconciliation_matches WHERE bank_transaction_id = $1::uuid AND ledger_entry_kind = 'payment' AND match_state <> 'released'`,
      [line]
    );
    expect(matches.map((m) => m.ledger_entry_id).sort()).toEqual(pays.map((p) => p.id).sort());
    const [bt] = await read<{ review_state: string; matched_payment_id: string | null }>(`SELECT review_state, matched_payment_id::text FROM banking.bank_transactions WHERE id = $1::uuid`, [line]);
    expect(bt.review_state).toBe("matched");
    expect(pays.map((p) => p.id)).toContain(bt.matched_payment_id);

    const gl = await read<{ account_id: string; dr: number; cr: number }>(
      `SELECT p.account_id::text, sum(p.debit_cents)::int AS dr, sum(p.credit_cents)::int AS cr
         FROM accounting.journal_entry_postings p
        WHERE p.operating_company_id = $1::uuid AND p.source_transaction_type = 'customer_payment' AND p.source_transaction_id = ANY($2::uuid[])
        GROUP BY 1`,
      [companyId, pays.map((p) => p.id)]
    );
    const byAcct = Object.fromEntries(gl.map((g) => [g.account_id, g]));
    expect(byAcct[bankGl]).toMatchObject({ dr: 105000, cr: 0 });
    expect(byAcct[arGl]).toMatchObject({ dr: 0, cr: 105000 });
  });

  it("a remainder to a named difference account posts Dr bank / Cr that account, so the bank side equals the line", async () => {
    const line = await seedDeposit(10000);
    const r = await receivePaymentsAndMatch({
      operating_company_id: companyId,
      bank_transaction_id: line,
      actor_user_uuid: userId,
      applications: [{ invoice_id: invB1, amount_cents: 9000 }],
      remainder: { kind: "difference", account_id: miscGl },
    });
    expect(r.remainder_cents).toBe(1000);
    expect(r.difference_journal_entry_id).toBeTruthy();
    const legs = await read<{ account_id: string; dr: number; cr: number }>(
      `SELECT account_id::text, debit_cents::int AS dr, credit_cents::int AS cr FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid`,
      [r.difference_journal_entry_id]
    );
    expect(legs.find((l) => l.account_id === bankGl)).toMatchObject({ dr: 1000 });
    expect(legs.find((l) => l.account_id === miscGl)).toMatchObject({ cr: 1000 });
  });

  it("a refusal AFTER the first customer's payment was written rolls everything back (no payment without its match)", async () => {
    // Customer A's payment (invA2, 5,000 open) is written first; customer B's application asks 15,000 of invB1, whose
    // open balance is 6,000 after the cases above -> the writer refuses -> the whole transaction rolls back.
    const line = await seedDeposit(20000);
    await expect(
      receivePaymentsAndMatch({
        operating_company_id: companyId,
        bank_transaction_id: line,
        actor_user_uuid: userId,
        applications: [{ invoice_id: invA2, amount_cents: 5000 }, { invoice_id: invB1, amount_cents: 15000 }],
      })
    ).rejects.toThrow("apply_amount_exceeds_invoice_open");
    const left = await read<{ n: number }>(`SELECT count(*)::int AS n FROM accounting.payments WHERE source_bank_transaction_id = $1::uuid`, [line]);
    expect(left[0].n).toBe(0);
    const [inv] = await read<{ amount_open_cents: number }>(`SELECT amount_open_cents::int FROM accounting.invoices WHERE id = $1::uuid`, [invA2]);
    expect(inv.amount_open_cents).toBe(5000);
    const [bt] = await read<{ review_state: string | null }>(`SELECT review_state FROM banking.bank_transactions WHERE id = $1::uuid`, [line]);
    expect(bt.review_state).not.toBe("matched");
  });
});
