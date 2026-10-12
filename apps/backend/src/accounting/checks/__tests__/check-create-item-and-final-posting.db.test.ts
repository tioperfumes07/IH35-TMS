// DEGH-03 + DEGH-04 (LEAD 443.113, Codex deep wiring audit) — real Postgres, isolated companies.
// DEGH-03: a category check line never takes an arbitrary item sharing its account (old code: `... LIMIT 1`).
// DEGH-04: a check exists only if it posts — flag off or a posting refusal saves NOTHING (old code: 201 + unposted check).
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { createIsolatedOperatingCompany, ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { insertMaintenanceCategoryMap } from "../../../../test-helpers/isolated-company.js";
import { createCheck } from "../check-create.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const ACTOR_USER_ID = "00000000-0000-4000-8000-0000000000cd";

type Fixture = { companyId: string; bankAccountId: string; vendorId: string; maintenanceAccountId: string; itemIds: string[] };

describeIntegration("check-create — DEGH-03 named item + DEGH-04 final-or-nothing (real Postgres)", () => {
  let db: pg.Client;
  let ambiguous: Fixture; // flag ON, TWO items on the maintenance account
  let flagOff: Fixture; // flag OFF, one item

  async function tx<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { const r = await fn(); await db.query("COMMIT"); return r; }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  async function setup(label: string, itemCount: number, flagOn: boolean): Promise<Fixture> {
    const { companyId } = await createIsolatedOperatingCompany({ label });
    const suffix = randomUUID().slice(0, 6);
    const f: Fixture = { companyId, bankAccountId: randomUUID(), vendorId: randomUUID(), maintenanceAccountId: randomUUID(), itemIds: [] };
    const cashAccountId = randomUUID();
    const apAccountId = randomUUID();
    await tx(companyId, async () => {
      await db.query("SET LOCAL app.allow_owner_bootstrap = '1'");
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [ACTOR_USER_ID, `chkdegh-${suffix}@test.local`]
      );
      const mk = (id: string, num: string, name: string, type: string) =>
        db.query(
          `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
           VALUES ($1::uuid,$2::uuid,$3,$4,$5,true)`,
          [id, companyId, `${num}${suffix}`, name, type]
        );
      await mk(cashAccountId, "CASH", "Test Cash", "Asset");
      await mk(apAccountId, "AP", "Test AP", "Liability");
      await mk(f.maintenanceAccountId, "MAINT", "Test Maintenance", "Expense");
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id)
         SELECT $1::uuid, 'ap_control', $2::uuid
          WHERE NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles WHERE operating_company_id = $1::uuid AND role = 'ap_control')`,
        [companyId, apAccountId]
      );
      await db.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id, account_class, is_active, sync_status)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,'depository',true,'active')`,
        [f.bankAccountId, companyId, `Test Checking ${suffix}`, cashAccountId]
      );
      await db.query(
        `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid,$2::uuid,$3,'Other')`,
        [f.vendorId, companyId, `Test Vendor ${suffix}`]
      );
      await insertMaintenanceCategoryMap(db, companyId, f.maintenanceAccountId);
      for (let i = 0; i < itemCount; i++) {
        const id = randomUUID();
        f.itemIds.push(id);
        await db.query(
          `INSERT INTO catalogs.items (id, operating_company_id, item_name, item_type, default_expense_account_id)
           VALUES ($1::uuid,$2::uuid,$3,'Service',$4::uuid)`,
          [id, companyId, `Maint Item ${i + 1} ${suffix}`, f.maintenanceAccountId]
        );
      }
      if (flagOn) {
        await db.query(
          `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
           VALUES ('EXPENSE_GL_POSTING_ENABLED', $1::uuid, NULL, true, $2::uuid)`,
          [companyId, ACTOR_USER_ID]
        );
      } else {
        await db.query(
          `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
           VALUES ('EXPENSE_GL_POSTING_ENABLED', $1::uuid, NULL, false, $2::uuid)`,
          [companyId, ACTOR_USER_ID]
        );
      }
    });
    return f;
  }

  async function savedFor(f: Fixture, checkNumber: string) {
    return tx(f.companyId, async () => {
      const e = await db.query(`SELECT count(*)::int AS n FROM accounting.expenses WHERE operating_company_id = $1::uuid AND check_number = $2`, [f.companyId, checkNumber]);
      const r = await db.query(
        `SELECT count(*)::int AS n FROM banking.check_number_registry WHERE operating_company_id = $1::uuid AND check_number = $2`,
        [f.companyId, checkNumber]
      );
      return { expenses: e.rows[0].n as number, registry: r.rows[0].n as number };
    });
  }

  const checkInput = (f: Fixture, checkNumber: string, line: Record<string, unknown>) => ({
    bank_account_id: f.bankAccountId,
    payee_kind: "vendor",
    payee_id: f.vendorId,
    check_date: "2026-10-12",
    print_later: false,
    check_number: checkNumber,
    lines: [{ line_kind: "category" as const, category_kind: "maintenance", category_code: "maintenance", amount_cents: 5000, ...line }],
  });

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    ambiguous = await setup("chkdegh-amb", 2, true);
    flagOff = await setup("chkdegh-off", 1, false);
  }, 120_000);

  afterAll(async () => { await db?.end().catch(() => {}); });

  it("DEGH-03: a category line whose account holds two items is REFUSED by name — nothing saved", async () => {
    const no = `DEGH3-${randomUUID().slice(0, 8)}`;
    await expect(createCheck(ambiguous.companyId, ACTOR_USER_ID, checkInput(ambiguous, no, {}))).rejects.toMatchObject({
      code: "CATEGORY_ITEM_AMBIGUOUS",
    });
    expect(await savedFor(ambiguous, no)).toEqual({ expenses: 0, registry: 0 });
  }, 60_000);

  it("DEGH-03: the item the operator NAMES on the category line is the one written, and the check posts", async () => {
    const no = `DEGH3N-${randomUUID().slice(0, 8)}`;
    const named = ambiguous.itemIds[1];
    const result = await createCheck(ambiguous.companyId, ACTOR_USER_ID, checkInput(ambiguous, no, { item_id: named }));
    expect(result.posting_status).toBe("posted");
    const rows = await tx(ambiguous.companyId, async () =>
      (await db.query(`SELECT item_id::text FROM accounting.expense_lines WHERE expense_id = $1::uuid`, [result.id])).rows
    );
    expect(rows).toEqual([{ item_id: named }]);
  }, 60_000);

  it("DEGH-03: a named item that posts to another account is refused", async () => {
    const otherAccount = randomUUID();
    const otherItem = randomUUID();
    await tx(ambiguous.companyId, async () => {
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$2::uuid,$3,'Other Expense','Expense',true)`,
        [otherAccount, ambiguous.companyId, `OTH${randomUUID().slice(0, 6)}`]
      );
      await db.query(
        `INSERT INTO catalogs.items (id, operating_company_id, item_name, item_type, default_expense_account_id)
         VALUES ($1::uuid,$2::uuid,$3,'Service',$4::uuid)`,
        [otherItem, ambiguous.companyId, `Other Item ${randomUUID().slice(0, 6)}`, otherAccount]
      );
    });
    const no = `DEGH3M-${randomUUID().slice(0, 8)}`;
    await expect(createCheck(ambiguous.companyId, ACTOR_USER_ID, checkInput(ambiguous, no, { item_id: otherItem }))).rejects.toMatchObject({
      code: "CATEGORY_ITEM_ACCOUNT_MISMATCH",
    });
    expect(await savedFor(ambiguous, no)).toEqual({ expenses: 0, registry: 0 });
  }, 60_000);

  it("DEGH-04: with expense GL posting OFF a final check is REFUSED — no check, no registry number saved", async () => {
    const no = `DEGH4-${randomUUID().slice(0, 8)}`;
    await expect(createCheck(flagOff.companyId, ACTOR_USER_ID, checkInput(flagOff, no, {}))).rejects.toMatchObject({
      code: "CHECK_GL_POSTING_DISABLED",
    });
    expect(await savedFor(flagOff, no)).toEqual({ expenses: 0, registry: 0 });
  }, 60_000);
});
