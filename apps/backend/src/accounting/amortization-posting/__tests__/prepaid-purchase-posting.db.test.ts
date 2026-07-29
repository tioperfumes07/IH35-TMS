/**
 * FIN-21 — prepaid PURCHASE (create-time capitalization) GL posting (real Postgres). Proves:
 *   (a) flag OFF -> NO-OP: zero journal-entry lines, the asset stays 'unposted' with no purchase_je_id.
 *   (b) flag ON  -> ONE balanced entry (Dr prepaid asset / Cr cash-or-A/P) for the FULL total,
 *                   and purchase_je_id + posting_status on the asset row point at it.
 *   (c) re-run    -> already_posted, re-links the SAME entry; the ledger does not double.
 *   (d) accounts missing -> REFUSED (ACCOUNT_MISSING), zero journal-entry lines (fail CLOSED).
 * The poster runs on the CALLER'S client (atomic with the asset insert), so these tests drive it the
 * same way the create route does. Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres exists.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { postPrepaidPurchase, type PrepaidPurchasePostingResult } from "../amortization-posting.service.js";
import { AmortizationPostingError } from "../amortization-posting.math.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("FIN-21 prepaid purchase GL posting (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  // Dedicated, UNIQUE actor for THIS file only: the PREPAID_EXPENSES_POST_ENABLED override is
  // USER-scoped so a sibling suite toggling the same flag on the shared TRANSP company cannot clobber it.
  const userId = "00000000-0000-4000-8000-0000000000e8";

  const acct = { prepaidAsset: randomUUID(), cash: randomUUID() };
  const assetIds: string[] = [];

  async function bypass<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) {
      await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
      await db.query("SELECT set_config('app.current_operating_company_id', $1, true)", [companyId]);
    }
    try { const out = await fn(db); await db.query("COMMIT"); return out; }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  async function setFlag(enabled: boolean) {
    await bypass(async () => {
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ('PREPAID_EXPENSES_POST_ENABLED', $1::uuid, $2::uuid, $3, $2::uuid)
         ON CONFLICT (flag_key, user_uuid) WHERE user_uuid IS NOT NULL DO UPDATE SET enabled = EXCLUDED.enabled`,
        [companyId, userId, enabled]
      );
    });
  }

  /** Seed just the prepaid asset header (the schedule rows are irrelevant to the purchase entry). */
  async function seedAsset(totalCents: number, withAccounts: boolean): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO accounting.prepaid_assets
           (id, operating_company_id, description, purchase_date, start_date, end_date,
            total_amount_cents, periods, period_amount_cents, remainder_cents,
            asset_account_id, payment_account_id, created_by_user_id, updated_by_user_id)
         VALUES ($1::uuid,$2::uuid,$3,'2026-01-01','2026-01-01','2026-12-31',$4,1,$4,0,$5,$6,$7::uuid,$7::uuid)`,
        [
          id, companyId, `FIN21 purchase ${suffix}-${assetIds.length}`, totalCents,
          withAccounts ? acct.prepaidAsset : null, withAccounts ? acct.cash : null, userId,
        ]
      );
    });
    assetIds.push(id);
    return id;
  }

  async function jeLineCount(assetId: string): Promise<number> {
    return bypass(async () => {
      const r = await db.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM accounting.journal_entry_postings
          WHERE source_transaction_id = $1 AND source_transaction_type = 'prepaid_purchase'`,
        [assetId]
      );
      return Number(r.rows[0]!.c);
    });
  }

  const post = (assetId: string, totalCents: number, withAccounts: boolean) =>
    bypass((client) =>
      postPrepaidPurchase(
        client,
        {
          operatingCompanyId: companyId,
          assetId,
          purchaseDate: "2026-01-01",
          description: `FIN21 purchase ${suffix}`,
          totalAmountCents: totalCents,
          assetAccountId: withAccounts ? acct.prepaidAsset : null,
          paymentAccountId: withAccounts ? acct.cash : null,
        },
        { userId }
      )
    );

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
        [userId, `fin21-purchase-${suffix}@test.local`]
      );
      const mk = async (id: string, n: string, type: string) =>
        db.query(
          `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
           VALUES ($1::uuid,$2::uuid,$3,$4,$5,true)`,
          [id, companyId, `${n}${suffix}`, `FIN21P ${n}`, type]
        );
      await mk(acct.prepaidAsset, "PPAP", "Asset");
      await mk(acct.cash, "PPCASH", "Asset");
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(`DELETE FROM accounting.transaction_source_links WHERE linked_object_id = ANY($1)`, [assetIds]);
        await db.query(`DELETE FROM accounting.journal_entry_postings WHERE source_transaction_id = ANY($1) AND source_transaction_type = 'prepaid_purchase'`, [assetIds]);
        await db.query(`UPDATE accounting.prepaid_assets SET purchase_je_id = NULL WHERE id = ANY($1::uuid[])`, [assetIds]);
        await db.query(`DELETE FROM accounting.journal_entries WHERE operating_company_id=$1::uuid AND memo LIKE $2`, [companyId, `%${suffix}%`]);
        await db.query(`DELETE FROM accounting.prepaid_assets WHERE id = ANY($1::uuid[])`, [assetIds]);
        await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [Object.values(acct)]);
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key='PREPAID_EXPENSES_POST_ENABLED' AND operating_company_id=$1::uuid`, [companyId]);
      });
    } catch { /* best-effort */ }
    await db.end();
  });

  it("(a) flag OFF -> no-op, zero journal-entry lines, asset stays unposted", async () => {
    await setFlag(false);
    const assetId = await seedAsset(240000, true);
    const res = (await post(assetId, 240000, true)) as PrepaidPurchasePostingResult;
    expect(res.result).toBe("skipped_flag_off");
    expect(res.journal_entry_id).toBeNull();
    expect(await jeLineCount(assetId)).toBe(0);
    const row = await bypass(async () =>
      (await db.query<{ posting_status: string; purchase_je_id: string | null }>(
        `SELECT posting_status, purchase_je_id::text FROM accounting.prepaid_assets WHERE id=$1::uuid`,
        [assetId]
      )).rows[0]!
    );
    expect(row.posting_status).toBe("unposted");
    expect(row.purchase_je_id).toBeNull();
  });

  it("(b) flag ON -> balanced Dr prepaid asset / Cr cash for the full total, linked on the asset row", async () => {
    await setFlag(true);
    const assetId = await seedAsset(240000, true);
    const res = (await post(assetId, 240000, true)) as Extract<PrepaidPurchasePostingResult, { result: "posted" }>;
    expect(res.result).toBe("posted");
    expect(res.amount_cents).toBe(240000);

    expect(await jeLineCount(assetId)).toBe(2);
    const legs = await bypass(async () =>
      (await db.query<{ account_id: string; debit_or_credit: string; amount_cents: string }>(
        `SELECT account_id::text, debit_or_credit, amount_cents::text FROM accounting.journal_entry_postings
          WHERE source_transaction_id=$1 AND source_transaction_type='prepaid_purchase' ORDER BY line_sequence`,
        [assetId]
      )).rows
    );
    expect(legs).toHaveLength(2);
    expect(legs[0]).toMatchObject({ account_id: acct.prepaidAsset, debit_or_credit: "debit", amount_cents: "240000" });
    expect(legs[1]).toMatchObject({ account_id: acct.cash, debit_or_credit: "credit", amount_cents: "240000" });

    const row = await bypass(async () =>
      (await db.query<{ posting_status: string; purchase_je_id: string | null }>(
        `SELECT posting_status, purchase_je_id::text FROM accounting.prepaid_assets WHERE id=$1::uuid`,
        [assetId]
      )).rows[0]!
    );
    expect(row.posting_status).toBe("posted");
    expect(row.purchase_je_id).toBe(res.journal_entry_id);

    // (c) idempotent: a re-run re-links the SAME entry and does not double the ledger.
    const rerun = (await post(assetId, 240000, true)) as Extract<PrepaidPurchasePostingResult, { result: "already_posted" }>;
    expect(rerun.result).toBe("already_posted");
    expect(rerun.journal_entry_id).toBe(res.journal_entry_id);
    expect(await jeLineCount(assetId)).toBe(2);
  });

  it("(d) accounts missing -> REFUSED (ACCOUNT_MISSING), zero journal-entry lines", async () => {
    await setFlag(true);
    const assetId = await seedAsset(100000, false);
    let code: string | null = null;
    try {
      await post(assetId, 100000, false);
    } catch (e) {
      code = e instanceof AmortizationPostingError ? e.code : `other:${(e as Error).message}`;
    }
    expect(code).toBe("ACCOUNT_MISSING");
    expect(await jeLineCount(assetId)).toBe(0);
  });
});
