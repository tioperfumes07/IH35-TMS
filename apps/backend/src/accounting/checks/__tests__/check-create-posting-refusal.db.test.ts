// DEGH-04 (LEAD 443.113) — a posting refusal (application PostingEngineError) must roll the whole check back.
// Old code caught the error, kept the check + its registry number and returned 201 'unposted'. Real Postgres; the poster is
// replaced by one that refuses, so the refusal branch is exercised deterministically.
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../posting-engine.service.js", async (orig) => {
  const real = (await orig()) as typeof import("../../posting-engine.service.js");
  return {
    ...real,
    postSourceTransactionInClientTx: vi.fn(async () => {
      throw new real.PostingEngineError("SOURCE_NOT_FOUND", "test: the poster refused this expense");
    }),
  };
});

import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { createIsolatedOperatingCompany, ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { insertMaintenanceCategoryMap } from "../../../../test-helpers/isolated-company.js";
import { createCheck } from "../check-create.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const ACTOR_USER_ID = "00000000-0000-4000-8000-0000000000ce";

describeIntegration("check-create — DEGH-04 posting refusal rolls the check back (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const bankAccountId = randomUUID();
  const vendorId = randomUUID();
  const suffix = randomUUID().slice(0, 6);

  async function tx<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { const r = await fn(); await db.query("COMMIT"); return r; }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = (await createIsolatedOperatingCompany({ label: "chkdegh-ref" })).companyId;
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    const cash = randomUUID();
    const maint = randomUUID();
    await tx(async () => {
      await db.query("SET LOCAL app.allow_owner_bootstrap = '1'");
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [ACTOR_USER_ID, `chkdeghref-${suffix}@test.local`]
      );
      for (const [id, num, name, type] of [[cash, "CASH", "Test Cash", "Asset"], [maint, "MAINT", "Test Maintenance", "Expense"]]) {
        await db.query(
          `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
           VALUES ($1::uuid,$2::uuid,$3,$4,$5,true)`,
          [id, companyId, `${num}${suffix}`, name, type]
        );
      }
      await db.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id, account_class, is_active, sync_status)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,'depository',true,'active')`,
        [bankAccountId, companyId, `Test Checking ${suffix}`, cash]
      );
      await db.query(
        `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid,$2::uuid,$3,'Other')`,
        [vendorId, companyId, `Test Vendor ${suffix}`]
      );
      await insertMaintenanceCategoryMap(db, companyId, maint);
      await db.query(
        `INSERT INTO catalogs.items (id, operating_company_id, item_name, item_type, default_expense_account_id)
         VALUES ($1::uuid,$2::uuid,$3,'Service',$4::uuid)`,
        [randomUUID(), companyId, `Maint Item ${suffix}`, maint]
      );
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ('EXPENSE_GL_POSTING_ENABLED', $1::uuid, NULL, true, $2::uuid)`,
        [companyId, ACTOR_USER_ID]
      );
    });
  }, 120_000);

  afterAll(async () => { await db?.end().catch(() => {}); });

  it("a PostingEngineError refuses the check by name and saves nothing (no check, no registry number)", async () => {
    const no = `DEGH4R-${randomUUID().slice(0, 8)}`;
    await expect(
      createCheck(companyId, ACTOR_USER_ID, {
        bank_account_id: bankAccountId,
        payee_kind: "vendor",
        payee_id: vendorId,
        check_date: "2026-10-12",
        print_later: false,
        check_number: no,
        lines: [{ line_kind: "category", category_kind: "maintenance", category_code: "maintenance", amount_cents: 4200 }],
      })
    ).rejects.toMatchObject({ code: "CHECK_POSTING_REFUSED" });
    const saved = await tx(async () => ({
      expenses: (await db.query(`SELECT count(*)::int AS n FROM accounting.expenses WHERE operating_company_id = $1::uuid AND check_number = $2`, [companyId, no])).rows[0].n,
      registry: (await db.query(`SELECT count(*)::int AS n FROM banking.check_number_registry WHERE operating_company_id = $1::uuid AND check_number = $2`, [companyId, no])).rows[0].n,
    }));
    expect(saved).toEqual({ expenses: 0, registry: 0 });
  }, 60_000);
});
