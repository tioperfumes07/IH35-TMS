/**
 * [HOLD-FOR-JORGE — TIER 1] BANKING-GL-COMPLETION DEDUP FIX — a manual internal transfer (its own balanced
 * JE, posted by transfers.service.ts's createTransfer) and the LATER Plaid-synced bank-feed line for the
 * SAME physical movement must never BOTH post a JE for the same cash.
 *
 * Root-cause: when an operator (or the auto-matcher) links a Plaid-synced bank_transactions row to an
 * internal banking.transfers row via bank-recon's acceptMatchWithResolveDifference (match.service.ts),
 * that write stamps banking.bank_transactions.matched_transfer_id — but bank-feed-gl-posting.service.ts's
 * "is_transfer" interlock never READ that column (it only checked transfer_kind /
 * destination_bank_account_id / review_state='transfer', none of which accept-match sets). A feed line
 * matched to a transfer therefore still had status='categorized' + matched_journal_entry_id IS NULL, so a
 * SECOND call into maybePostBankCategorizationToGl would post a duplicate JE for cash already covered by
 * the transfer's own JE.
 *
 * This proves the two posters now share ONE dedupe key (matched_transfer_id) against a real migrated
 * Postgres:
 *   - a categorized bank-feed line with NO matched_transfer_id posts normally (control — proves the fix
 *     didn't just always skip).
 *   - the SAME shape of line, once bank-recon's acceptMatchWithResolveDifference links it to an internal
 *     transfer (matched_transfer_id stamped), is refused by bank-feed-gl-posting (reason: is_transfer) —
 *     zero journal_entry_postings for that bank transaction, so the transfer's own JE is the only JE for
 *     that cash movement.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { BANK_FEED_GL_POSTING_FLAG_KEY, maybePostBankCategorizationToGl } from "../bank-feed-gl-posting.service.js";
import { acceptMatchWithResolveDifference } from "../../accounting/bank-recon/match.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration(
  "BANKING-GL-COMPLETION DEDUP FIX — transfer match + bank-feed categorization share ONE dedupe key (real Postgres)",
  () => {
    let db: pg.Client;
    let companyId: string;
    const suffix = randomUUID().slice(0, 8);
    const userId = TEST_OWNER_USER_ID;

    const acct = {
      expense: randomUUID(),
      fromBank: randomUUID(),
      toBank: randomUUID(),
    };
    const fromBankAccountId = randomUUID();
    const toBankAccountId = randomUUID();
    const bankTxns: string[] = [];
    const transferIds: string[] = [];

    async function bypass(fn: () => Promise<void>) {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
      try {
        await fn();
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK").catch(() => {});
        throw e;
      }
    }

    async function scopedRead<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
      try {
        const r = await db.query(sql, params);
        await db.query("COMMIT");
        return r.rows as T[];
      } catch (e) {
        await db.query("ROLLBACK").catch(() => {});
        throw e;
      }
    }

    async function setFlag(enabled: boolean) {
      await bypass(async () => {
        await db.query(
          `DELETE FROM lib.feature_flag_overrides WHERE flag_key=$1 AND operating_company_id=$2::uuid AND user_uuid IS NULL`,
          [BANK_FEED_GL_POSTING_FLAG_KEY, companyId]
        );
        await db.query(
          `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
           VALUES ($1, $2::uuid, NULL, $3, $4::uuid)`,
          [BANK_FEED_GL_POSTING_FLAG_KEY, companyId, enabled, userId]
        );
      });
    }

    /** A categorized, money-OUT bank-feed line (the Plaid-synced leg of the physical transfer). */
    async function seedCategorizedFeedLine(amountCents: number): Promise<string> {
      const id = randomUUID();
      await bypass(async () => {
        await db.query(
          `INSERT INTO banking.bank_transactions
             (id, bank_account_id, operating_company_id, transaction_date, amount_cents, is_credit, status,
              description, categorization_gl_account_id)
           VALUES ($1::uuid,$2::uuid,$3::uuid, CURRENT_DATE, $4, false, 'categorized',
                   'Plaid-synced transfer leg', $5::uuid)`,
          [id, fromBankAccountId, companyId, -Math.abs(amountCents), acct.expense]
        );
      });
      bankTxns.push(id);
      return id;
    }

    /** The internal transfer record (createTransfer's own row) this feed line corresponds to. */
    async function seedTransfer(amountCents: number): Promise<string> {
      const id = randomUUID();
      await bypass(async () => {
        await db.query(
          `INSERT INTO banking.transfers
             (id, operating_company_id, transfer_type, from_account_id, from_account_kind,
              to_account_id, to_account_kind, amount_cents, transfer_date, created_by_user_id)
           VALUES ($1::uuid,$2::uuid,'bank_to_bank',$3::uuid,'bank',$4::uuid,'bank',$5,CURRENT_DATE,$6::uuid)`,
          [id, companyId, fromBankAccountId, toBankAccountId, amountCents, userId]
        );
      });
      transferIds.push(id);
      return id;
    }

    async function jeLines(bankTxnId: string) {
      return scopedRead<{ account_id: string }>(
        `SELECT account_id::text
         FROM accounting.journal_entry_postings
         WHERE operating_company_id = $1::uuid
           AND source_transaction_type = 'bank_categorization'
           AND source_transaction_id = $2`,
        [companyId, bankTxnId]
      );
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
          [userId, `xferdedup-${suffix}@test.local`]
        );
        const mk = async (id: string, n: string, type: string) =>
          db.query(
            `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
             VALUES ($1::uuid,$2::uuid,$3,$4,$5,true)`,
            [id, companyId, `${n}${suffix}`, `XFERDEDUP ${n}`, type]
          );
        await mk(acct.expense, "XDEXP", "Expense");
        await mk(acct.fromBank, "XDFRB", "Asset");
        await mk(acct.toBank, "XDTOB", "Asset");

        await db.query(
          `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id)
           VALUES ($1::uuid,$2::uuid,'XFERDEDUP From Bank',$3::uuid)`,
          [fromBankAccountId, companyId, acct.fromBank]
        );
        await db.query(
          `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id)
           VALUES ($1::uuid,$2::uuid,'XFERDEDUP To Bank',$3::uuid)`,
          [toBankAccountId, companyId, acct.toBank]
        );
      });
    });

    afterAll(async () => {
      if (!db) return;
      try {
        await bypass(async () => {
          await db.query(
            `DELETE FROM accounting.journal_entry_postings WHERE source_transaction_id = ANY($1) AND source_transaction_type='bank_categorization'`,
            [bankTxns]
          );
          await db.query(
            `DELETE FROM accounting.posting_batches WHERE source_transaction_id = ANY($1) AND source_transaction_type='bank_categorization'`,
            [bankTxns]
          );
          await db.query(`DELETE FROM bank.reconciliation_matches WHERE bank_transaction_id = ANY($1::uuid[])`, [bankTxns]);
          await db.query(`DELETE FROM banking.bank_transactions WHERE id = ANY($1::uuid[])`, [bankTxns]);
          await db.query(`DELETE FROM banking.transfers WHERE id = ANY($1::uuid[])`, [transferIds]);
          await db.query(`DELETE FROM banking.bank_accounts WHERE id = ANY($1::uuid[])`, [[fromBankAccountId, toBankAccountId]]);
          await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [[acct.expense, acct.fromBank, acct.toBank]]);
          await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key=$1 AND operating_company_id=$2::uuid`, [
            BANK_FEED_GL_POSTING_FLAG_KEY,
            companyId,
          ]);
        });
      } catch {
        /* best-effort */
      }
      await db.end();
    });

    it("control: a categorized feed line with NO matched_transfer_id posts normally", async () => {
      await setFlag(true);
      const txn = await seedCategorizedFeedLine(18_000);
      const res = await maybePostBankCategorizationToGl({ companyId, actorUserUuid: userId, bankTransactionId: txn });
      if (!res.posted) throw new Error(`expected posted; got reason='${res.reason}' message='${res.message ?? ""}'`);
      expect(res.posted).toBe(true);
      expect((await jeLines(txn)).length).toBe(2);
    });

    it("a feed line matched to an internal transfer (matched_transfer_id) is refused by bank-feed-gl-posting — never double-counts the cash", async () => {
      await setFlag(true);
      const amountCents = 26_400;
      const txn = await seedCategorizedFeedLine(amountCents);
      const transferId = await seedTransfer(amountCents);

      // bank-recon's accept-match path (SAME one an operator/auto-matcher uses to reconcile a Plaid-synced
      // line against an internal transfer) stamps matched_transfer_id — the SAME dedupe key
      // bank-feed-gl-posting now reads.
      const matchResult = await acceptMatchWithResolveDifference({
        operating_company_id: companyId,
        bank_transaction_id: txn,
        actor_user_uuid: userId,
        ledger_entry_kind: "transfer",
        ledger_entry_id: transferId,
        difference_account_id: randomUUID(), // unused: amounts match exactly -> zero variance -> never read
      });
      expect(matchResult.variance_cents).toBe(0);
      expect(matchResult.difference_posted).toBe(false);

      const [stamped] = await scopedRead<{ matched_transfer_id: string | null; review_state: string; matched_journal_entry_id: string | null }>(
        `SELECT matched_transfer_id::text, review_state, matched_journal_entry_id::text
         FROM banking.bank_transactions WHERE id = $1::uuid`,
        [txn]
      );
      expect(stamped?.matched_transfer_id).toBe(transferId);
      // Confirms the OLD interlock (transfer_kind / destination_bank_account_id / review_state='transfer')
      // would have missed this row entirely — accept-match sets review_state='matched', not 'transfer'.
      expect(stamped?.review_state).toBe("matched");
      expect(stamped?.matched_journal_entry_id).toBeNull();

      // Without the fix, decide() would sail past every existing interlock (matched_journal_entry_id is
      // NULL, matched_bill_id is NULL, transfer_kind/destination_bank_account_id are NULL, review_state is
      // 'matched' not 'transfer') and post a SECOND JE for cash already covered by the transfer's own JE.
      const res = await maybePostBankCategorizationToGl({ companyId, actorUserUuid: userId, bankTransactionId: txn });
      expect(res.posted).toBe(false);
      if (!res.posted) expect(res.reason).toBe("is_transfer");
      expect((await jeLines(txn)).length).toBe(0);
    });
  }
);
