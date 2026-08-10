/**
 * BANK-ECON-03 / BANK-SURF-03 root-cause fix (0285-banking-transfer-gl-gap Option 1, owner-approved
 * #3134) — proves the bank-feed "mark as transfer" action (POST …/transactions/:id/transfer) actually
 * mints a real banking.transfers row via the EXISTING createTransfer() poster (Surface A) instead of only
 * tagging banking.bank_transactions columns.
 *
 * Before this fix: transfers=0 in production even though the categorize route tagged
 * status='transfer' — the tag was a dead-end (no paired ledger row, no JE possible). This proves, on a
 * real migrated Postgres:
 *   1. Marking a lone feed line as transfer with NO existing_transfer_id MINTS exactly one
 *      banking.transfers row and stamps matched_transfer_id on the feed line (the reverse-linkage the
 *      Transfers tab / bank-feed-gl-posting "is_transfer" interlock depend on).
 *   2. A second call to the SAME endpoint for the SAME feed line is idempotent — it does NOT mint a
 *      second banking.transfers row.
 *   3. Passing existing_transfer_id (the RecordTransferModal/TransferModal path, which already minted the
 *      transfer via POST /banking/transfers) links-only — zero new banking.transfers rows.
 *   4. Pairing two feed legs (paired_transaction_id) mints exactly ONE transfer and stamps
 *      matched_transfer_id on BOTH legs — never two.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { markBankFeedLineAsTransfer } from "../transfers.service.js";
import { createTransfer } from "../transfers.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("BANK-ECON-03 — mark-transfer mints a real banking.transfers row (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  const userId = TEST_OWNER_USER_ID;

  const acct = { fromBank: randomUUID(), toBank: randomUUID() };
  const fromBankAccountId = randomUUID();
  const toBankAccountId = randomUUID();
  const bankTxns: string[] = [];
  const transferIds: string[] = [];

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
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
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      const r = await db.query(sql, params);
      await db.query("COMMIT");
      return r.rows as T[];
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function seedFeedLine(bankAccountId: string, amountCents: number, isCredit: boolean): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO banking.bank_transactions
           (id, bank_account_id, operating_company_id, transaction_date, amount_cents, is_credit, status,
            description)
         VALUES ($1::uuid,$2::uuid,$3::uuid, CURRENT_DATE, $4, $5, 'pending_categorization',
                 'MARKXFER test leg')`,
        [id, bankAccountId, companyId, isCredit ? Math.abs(amountCents) : -Math.abs(amountCents), isCredit]
      );
    });
    bankTxns.push(id);
    return id;
  }

  async function transferCountForCompany(): Promise<number> {
    const [row] = await scopedRead<{ n: string }>(
      `SELECT count(*)::text AS n FROM banking.transfers WHERE operating_company_id = $1::uuid AND id = ANY($2::uuid[])`,
      [companyId, transferIds.length ? transferIds : [randomUUID()]]
    );
    return Number(row?.n ?? 0);
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
        [userId, `markxfer-${suffix}@test.local`]
      );
      const mk = async (id: string, n: string) =>
        db.query(
          `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
           VALUES ($1::uuid,$2::uuid,$3,$4,'Asset',true)`,
          [id, companyId, `${n}${suffix}`, `MARKXFER ${n}`]
        );
      await mk(acct.fromBank, "MXFRB");
      await mk(acct.toBank, "MXTOB");

      await db.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id)
         VALUES ($1::uuid,$2::uuid,'MARKXFER From Bank',$3::uuid)`,
        [fromBankAccountId, companyId, acct.fromBank]
      );
      await db.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id)
         VALUES ($1::uuid,$2::uuid,'MARKXFER To Bank',$3::uuid)`,
        [toBankAccountId, companyId, acct.toBank]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(`DELETE FROM banking.bank_transactions WHERE id = ANY($1::uuid[])`, [bankTxns]);
        await db.query(`DELETE FROM banking.transfers WHERE id = ANY($1::uuid[])`, [transferIds]);
        await db.query(`DELETE FROM banking.bank_accounts WHERE id = ANY($1::uuid[])`, [[fromBankAccountId, toBankAccountId]]);
        await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [[acct.fromBank, acct.toBank]]);
      });
    } catch {
      /* best-effort */
    }
    await db.end();
  });

  it("mints exactly one banking.transfers row and stamps matched_transfer_id on the feed line", async () => {
    const txn = await seedFeedLine(fromBankAccountId, 12_345, false);

    const result = await markBankFeedLineAsTransfer({
      operatingCompanyId: companyId,
      bankTransactionId: txn,
      destinationBankAccountId: toBankAccountId,
      transferKind: "out",
      userId,
    });
    expect(result.minted).toBe(true);
    transferIds.push(result.transfer_id);

    const [transferRow] = await scopedRead<{
      id: string;
      from_account_id: string;
      to_account_id: string;
      amount_cents: string;
    }>(
      `SELECT id::text, from_account_id::text, to_account_id::text, amount_cents::text
       FROM banking.transfers WHERE id = $1::uuid`,
      [result.transfer_id]
    );
    expect(transferRow?.from_account_id).toBe(fromBankAccountId);
    expect(transferRow?.to_account_id).toBe(toBankAccountId);
    expect(Number(transferRow?.amount_cents)).toBe(12_345);

    const [stamped] = await scopedRead<{ matched_transfer_id: string | null; status: string | null }>(
      `SELECT matched_transfer_id::text, status FROM banking.bank_transactions WHERE id = $1::uuid`,
      [txn]
    );
    expect(stamped?.matched_transfer_id).toBe(result.transfer_id);
    expect(stamped?.status).toBe("transfer");
  });

  it("is idempotent — a second call for the SAME feed line never mints a second transfer", async () => {
    const txn = await seedFeedLine(fromBankAccountId, 22_000, false);

    const first = await markBankFeedLineAsTransfer({
      operatingCompanyId: companyId,
      bankTransactionId: txn,
      destinationBankAccountId: toBankAccountId,
      transferKind: "out",
      userId,
    });
    transferIds.push(first.transfer_id);
    expect(first.minted).toBe(true);

    const second = await markBankFeedLineAsTransfer({
      operatingCompanyId: companyId,
      bankTransactionId: txn,
      destinationBankAccountId: toBankAccountId,
      transferKind: "out",
      userId,
    });
    expect(second.minted).toBe(false);
    expect(second.transfer_id).toBe(first.transfer_id);
  });

  it("existing_transfer_id (RecordTransferModal/TransferModal path) links-only — mints nothing new", async () => {
    const created = await createTransfer(
      {
        operatingCompanyId: companyId,
        transferType: "bank_to_bank",
        fromAccountId: fromBankAccountId,
        fromAccountKind: "bank",
        toAccountId: toBankAccountId,
        toAccountKind: "bank",
        amountCents: 31_000,
        transferDate: new Date().toISOString().slice(0, 10),
      },
      userId
    );
    transferIds.push(created.id);

    const txn = await seedFeedLine(fromBankAccountId, 31_000, false);
    const linked = await markBankFeedLineAsTransfer({
      operatingCompanyId: companyId,
      bankTransactionId: txn,
      destinationBankAccountId: toBankAccountId,
      transferKind: "out",
      existingTransferId: created.id,
      userId,
    });
    expect(linked.minted).toBe(false);
    expect(linked.transfer_id).toBe(created.id);

    const beforeCount = await transferCountForCompany();
    expect(beforeCount).toBe(new Set(transferIds).size);
  });

  it("pairing two feed legs mints exactly ONE transfer and stamps matched_transfer_id on BOTH legs", async () => {
    const outLeg = await seedFeedLine(fromBankAccountId, 8_800, false);
    const inLeg = await seedFeedLine(toBankAccountId, 8_800, true);

    const first = await markBankFeedLineAsTransfer({
      operatingCompanyId: companyId,
      bankTransactionId: outLeg,
      destinationBankAccountId: toBankAccountId,
      transferKind: "out",
      pairedTransactionId: inLeg,
      userId,
    });
    transferIds.push(first.transfer_id);
    expect(first.minted).toBe(true);

    // The OTHER leg marking itself (as the paired UI flow would do) must reuse the SAME transfer.
    const second = await markBankFeedLineAsTransfer({
      operatingCompanyId: companyId,
      bankTransactionId: inLeg,
      destinationBankAccountId: fromBankAccountId,
      transferKind: "in",
      pairedTransactionId: outLeg,
      userId,
    });
    expect(second.minted).toBe(false);
    expect(second.transfer_id).toBe(first.transfer_id);

    const rows = await scopedRead<{ id: string; matched_transfer_id: string | null }>(
      `SELECT id::text, matched_transfer_id::text FROM banking.bank_transactions WHERE id = ANY($1::uuid[])`,
      [[outLeg, inLeg]]
    );
    expect(rows.every((r) => r.matched_transfer_id === first.transfer_id)).toBe(true);
  });

  it("concurrent mark calls for the same feed line mint exactly ONE banking.transfers row", async () => {
    const txn = await seedFeedLine(fromBankAccountId, 45_600, false);
    const [a, b] = await Promise.all([
      markBankFeedLineAsTransfer({
        operatingCompanyId: companyId,
        bankTransactionId: txn,
        destinationBankAccountId: toBankAccountId,
        transferKind: "out",
        userId,
      }),
      markBankFeedLineAsTransfer({
        operatingCompanyId: companyId,
        bankTransactionId: txn,
        destinationBankAccountId: toBankAccountId,
        transferKind: "out",
        userId,
      }),
    ]);
    transferIds.push(a.transfer_id, b.transfer_id);
    expect(a.transfer_id).toBe(b.transfer_id);
    expect([a.minted, b.minted].filter(Boolean)).toHaveLength(1);
    expect([a.changed, b.changed].filter(Boolean).length).toBeGreaterThanOrEqual(1);

    const mintedForTxn = await scopedRead<{ id: string }>(
      `SELECT t.id::text
       FROM banking.transfers t
       JOIN banking.bank_transactions bt ON bt.matched_transfer_id = t.id
       WHERE bt.id = $1::uuid AND t.revoked_at IS NULL`,
      [txn]
    );
    expect(mintedForTxn).toHaveLength(1);
  });
});
