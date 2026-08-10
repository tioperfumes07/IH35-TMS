/**
 * [HOLD-FOR-JORGE — TIER 1] BANKING-GL-COMPLETION — banking.transfers -> GL posting, end-to-end (real
 * Postgres). Proves the new "transfer" PostingSourceType (posting-engine.service.ts) + createTransfer's
 * gated call to it (transfers.service.ts):
 *   - flag OFF (default): createTransfer posts nothing (zero JE), matching every other poster's dark
 *     contract; only the cached bank-balance bump happens.
 *   - flag ON: a bank_to_bank transfer posts a BALANCED JE — DR destination bank ledger / CR source bank
 *     ledger — via the SAME bank->GL bridge (banking.bank_accounts.ledger_account_id) every other banking
 *     poster uses. No new GL math.
 *   - a cc_payment transfer (paying down a card from a bank account) posts DR the CC-liability
 *     catalogs.accounts row (to_account, kind='coa') / CR the bank ledger (from_account, kind='bank').
 *   - idempotent re-post: a second postSourceTransaction('transfer', ...) call returns already_posted,
 *     never duplicates.
 *   - revoke reverses: revokeTransfer posts an equal-and-opposite reversal JE.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { createTransfer, revokeTransfer } from "../transfers.service.js";
import { postSourceTransaction } from "../../accounting/posting-engine.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("BANKING-GL-COMPLETION transfer -> GL posting end-to-end (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 6);
  const userId = "00000000-0000-4000-8000-0000000000f5";

  const fromBankGlId = randomUUID(); // catalogs.accounts GL register for the source bank
  const toBankGlId = randomUUID(); // catalogs.accounts GL register for the destination bank
  const ccLiabilityId = randomUUID(); // catalogs.accounts CC-liability (coa leg)
  const fromBankAccountId = randomUUID();
  const toBankAccountId = randomUUID();
  const createdTransferIds: string[] = [];

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

  // FLAKE FIX: write a USER-scoped override (user_uuid = this file's dedicated actor), NOT a tenant-scoped
  // (operating_company_id, user_uuid IS NULL) one. ensureIntegrationPrerequisites() hands EVERY integration
  // test the SAME cached TRANSP company, so a tenant-scoped TRANSFER_GL_POSTING_ENABLED override on it
  // would be clobberable by any parallel sibling *.db.test.ts that toggles the same flag on that shared
  // company. maybePostTransferGl (transfers.service.ts) resolves the flag via isEnabled(client, key,
  // {operating_company_id, user_uuid: userId}) and this file always posts as its own dedicated actor
  // (userId), so a user-scoped override for that actor is immune to cross-file tenant contention. Still
  // carries operating_company_id so the existing cleanup delete (by flag_key + operating_company_id)
  // continues to remove it.
  async function setFlagOverride(enabled: boolean) {
    await bypass(async () => {
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ('TRANSFER_GL_POSTING_ENABLED',$1::uuid,$2::uuid,$3,$2::uuid)
         ON CONFLICT (flag_key, user_uuid) WHERE user_uuid IS NOT NULL DO UPDATE SET enabled = EXCLUDED.enabled`,
        [companyId, userId, enabled]
      );
    });
  }

  async function jePostingsForTransfer(transferId: string) {
    return scopedRead<{ account_id: string; debit_or_credit: string; amount_cents: string }>(
      `SELECT account_id::text, debit_or_credit, amount_cents::text
         FROM accounting.journal_entry_postings
        WHERE operating_company_id = $1::uuid AND source_transaction_type = 'transfer' AND source_transaction_id = $2
        ORDER BY line_sequence ASC`,
      [companyId, transferId]
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
        [userId, `transfer-gl-${suffix}@test.local`]
      );
      await db.query(
        `INSERT INTO org.user_company_access (user_id, company_id) VALUES ($1::uuid,$2::uuid) ON CONFLICT (user_id, company_id) DO NOTHING`,
        [userId, companyId]
      );
      await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key='TRANSFER_GL_POSTING_ENABLED' AND operating_company_id=$1::uuid`, [companyId]);

      const mkAccount = (id: string, code: string, name: string, type: string) =>
        db.query(
          `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
           VALUES ($1::uuid,$4::uuid,$2,$3,$5,true)`,
          [id, `${code}${suffix}`, name, companyId, type]
        );
      await mkAccount(fromBankGlId, "FRB", "From Bank GL Test", "Asset");
      await mkAccount(toBankGlId, "TOB", "To Bank GL Test", "Asset");
      await mkAccount(ccLiabilityId, "CCL", "CC Liability Test", "Liability");

      await db.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id, is_active, current_balance_cents)
         VALUES ($1::uuid,$2::uuid,'Transfer From Bank',$3::uuid,true,0)`,
        [fromBankAccountId, companyId, fromBankGlId]
      );
      await db.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id, is_active, current_balance_cents)
         VALUES ($1::uuid,$2::uuid,'Transfer To Bank',$3::uuid,true,0)`,
        [toBankAccountId, companyId, toBankGlId]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(
          `DELETE FROM accounting.transaction_source_links WHERE linked_object_id = ANY($1) AND linked_object_type='transfer'`,
          [createdTransferIds]
        );
        await db.query(
          `DELETE FROM accounting.journal_entry_postings WHERE source_transaction_id = ANY($1) AND source_transaction_type='transfer'`,
          [createdTransferIds]
        );
        await db.query(
          `DELETE FROM accounting.posting_batches WHERE source_transaction_id = ANY($1) AND source_transaction_type='transfer'`,
          [createdTransferIds]
        );
        await db.query(`DELETE FROM banking.transfers WHERE id = ANY($1::uuid[])`, [createdTransferIds]);
        await db.query(`DELETE FROM banking.bank_accounts WHERE id = ANY($1::uuid[])`, [[fromBankAccountId, toBankAccountId]]);
        await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [[fromBankGlId, toBankGlId, ccLiabilityId]]);
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key='TRANSFER_GL_POSTING_ENABLED' AND operating_company_id=$1::uuid`, [companyId]);
        await db.query(`DELETE FROM org.user_company_access WHERE user_id=$1::uuid AND company_id=$2::uuid`, [userId, companyId]);
      });
    } catch {
      /* best-effort cleanup */
    }
    await db.end();
  });

  it("flag OFF (default) — createTransfer posts NOTHING (dark by default)", async () => {
    await setFlagOverride(false);
    const transfer = await createTransfer(
      {
        operatingCompanyId: companyId,
        transferType: "bank_to_bank",
        fromAccountId: fromBankAccountId,
        fromAccountKind: "bank",
        toAccountId: toBankAccountId,
        toAccountKind: "bank",
        amountCents: 10_000,
        transferDate: new Date().toISOString().slice(0, 10),
      },
      userId
    );
    createdTransferIds.push(transfer.id);

    const lines = await jePostingsForTransfer(transfer.id);
    expect(lines.length).toBe(0);
  });

  it("flag ON — bank_to_bank transfer posts a BALANCED JE: DR destination bank / CR source bank", async () => {
    await setFlagOverride(true);
    const amountCents = 55_500;
    const transfer = await createTransfer(
      {
        operatingCompanyId: companyId,
        transferType: "bank_to_bank",
        fromAccountId: fromBankAccountId,
        fromAccountKind: "bank",
        toAccountId: toBankAccountId,
        toAccountKind: "bank",
        amountCents,
        transferDate: new Date().toISOString().slice(0, 10),
      },
      userId
    );
    createdTransferIds.push(transfer.id);

    const lines = await jePostingsForTransfer(transfer.id);
    expect(lines.length).toBe(2);
    const debit = lines.find((l) => l.debit_or_credit === "debit");
    const credit = lines.find((l) => l.debit_or_credit === "credit");
    expect(debit?.account_id).toBe(toBankGlId); // DR destination
    expect(credit?.account_id).toBe(fromBankGlId); // CR source
    expect(Number(debit?.amount_cents)).toBe(amountCents);
    expect(Number(credit?.amount_cents)).toBe(amountCents);
    expect(Number(debit?.amount_cents)).toBe(Number(credit?.amount_cents)); // balanced

    // Idempotent re-post — calling the engine again for the SAME transfer never duplicates.
    const again = await postSourceTransaction(
      { operating_company_id: companyId, source_transaction_type: "transfer", source_transaction_id: transfer.id },
      { userId }
    );
    expect(again.result).toBe("already_posted");
    expect((await jePostingsForTransfer(transfer.id)).length).toBe(2);
  });

  it("flag ON — cc_payment transfer posts DR CC-liability (coa) / CR source bank", async () => {
    await setFlagOverride(true);
    const amountCents = 32_100;
    const transfer = await createTransfer(
      {
        operatingCompanyId: companyId,
        transferType: "cc_payment",
        fromAccountId: fromBankAccountId,
        fromAccountKind: "bank",
        toAccountId: ccLiabilityId,
        toAccountKind: "coa",
        amountCents,
        transferDate: new Date().toISOString().slice(0, 10),
      },
      userId
    );
    createdTransferIds.push(transfer.id);

    const lines = await jePostingsForTransfer(transfer.id);
    expect(lines.length).toBe(2);
    const debit = lines.find((l) => l.debit_or_credit === "debit");
    const credit = lines.find((l) => l.debit_or_credit === "credit");
    expect(debit?.account_id).toBe(ccLiabilityId); // DR the CC-liability (destination)
    expect(credit?.account_id).toBe(fromBankGlId); // CR the source bank
    expect(Number(debit?.amount_cents)).toBe(amountCents);
    expect(Number(credit?.amount_cents)).toBe(amountCents);
  });

  it("revoke reverses the posted JE (equal-and-opposite)", async () => {
    await setFlagOverride(true);
    const amountCents = 8_800;
    const transfer = await createTransfer(
      {
        operatingCompanyId: companyId,
        transferType: "bank_to_bank",
        fromAccountId: fromBankAccountId,
        fromAccountKind: "bank",
        toAccountId: toBankAccountId,
        toAccountKind: "bank",
        amountCents,
        transferDate: new Date().toISOString().slice(0, 10),
      },
      userId
    );
    createdTransferIds.push(transfer.id);
    expect((await jePostingsForTransfer(transfer.id)).length).toBe(2);

    await revokeTransfer(transfer.id, companyId, "test revoke", userId);

    const allLines = await scopedRead<{ debit_or_credit: string; amount_cents: string; reversal_of_line_id: string | null }>(
      `SELECT debit_or_credit, amount_cents::text, reversal_of_line_id::text
         FROM accounting.journal_entry_postings
        WHERE operating_company_id = $1::uuid AND source_transaction_type = 'transfer' AND source_transaction_id = $2
        ORDER BY created_at ASC`,
      [companyId, transfer.id]
    );
    // 2 original + 2 reversal lines; the reversal set nets to zero against the original.
    expect(allLines.length).toBe(4);
    const totalDr = allLines.filter((l) => l.debit_or_credit === "debit").reduce((s, l) => s + Number(l.amount_cents), 0);
    const totalCr = allLines.filter((l) => l.debit_or_credit === "credit").reduce((s, l) => s + Number(l.amount_cents), 0);
    expect(totalDr).toBe(totalCr);
    const reversalLines = allLines.filter((l) => l.reversal_of_line_id != null);
    expect(reversalLines.length).toBe(2);
  });
});
