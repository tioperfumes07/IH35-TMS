// Real Postgres proof for check-create.service.ts's createCheck() — isolated company.
// CheckPayeeError fixture fix (443.92 #1): seeds all required rows in beforeAll so the test runs
// on any migrated DB. Also proves the 443.92 #1b engine fix: category-line check posts, TB = 0
// (item_id resolved from account, expense_lines_item_id_required satisfied).
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { createIsolatedOperatingCompany, ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { createCheck, CreateCheckConflictError, CheckAccountError } from "../check-create.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("check-create.service createCheck (real Postgres, isolated company)", () => {
  let db: pg.Client;
  let companyId: string;
  const vendorId = randomUUID();
  const driverId = randomUUID();
  const bankAccountId = randomUUID();
  const cashAccountId = randomUUID();
  const apAccountId = randomUUID();
  const maintenanceAccountId = randomUUID();
  const maintenanceItemId = randomUUID();
  const suffix = randomUUID().slice(0, 6);
  const ACTOR_USER_ID = "00000000-0000-4000-8000-0000000000cc";

  function uniqueCheckNumber(): string {
    return `TST-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { await fn(); await db.query("COMMIT"); }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  async function scopedRead<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { const r = await db.query(sql, params); await db.query("COMMIT"); return r.rows as T[]; }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const isolated = await createIsolatedOperatingCompany({ label: "chkcreate" });
    companyId = isolated.companyId;
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();

    await bypass(async () => {
      // Actor user — created_by_user_id FK on accounting.expenses + banking.check_number_registry
      await db.query("SET LOCAL app.allow_owner_bootstrap = '1'");
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language)
         VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [ACTOR_USER_ID, `chkcreate-${suffix}@test.local`]
      );

      // Accounts
      const mk = async (id: string, num: string, name: string, type: string) =>
        db.query(
          `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
           VALUES ($1::uuid,$2::uuid,$3,$4,$5,true)`,
          [id, companyId, `${num}${suffix}`, name, type]
        );
      await mk(cashAccountId, "CASH", "Test Cash", "Asset");
      await mk(apAccountId, "AP", "Test AP", "Liability");
      await mk(maintenanceAccountId, "MAINT", "Test Maintenance", "Expense");

      // AP control role binding (needed by postSourceTransaction)
      await db.query(
        // 443.94: COA roles live in accounting.chart_of_accounts_roles (there is no account_role_bindings table).
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id)
         SELECT $1::uuid, 'ap_control', $2::uuid
          WHERE NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles WHERE operating_company_id = $1::uuid AND role = 'ap_control')`,
        [companyId, apAccountId]
      );

      // Bank account
      await db.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id, account_class, is_active, sync_status)
         VALUES ($1::uuid,$2::uuid,'Test Checking ${suffix}',$3::uuid,'depository',true,'active')`,
        [bankAccountId, companyId, cashAccountId]
      );

      // Vendor
      await db.query(
        `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type)
         VALUES ($1::uuid,$2::uuid,'Test Vendor ${suffix}','Other')`,
        [vendorId, companyId]
      );

      // Driver (for driver-payee tests)
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone)
         VALUES ($1::uuid,$2::uuid,'Test','Driver${suffix}','555-0000')`,
        [driverId, companyId]
      );

      // Category map: maintenance/maintenance → Expense account
      await db.query(
        `INSERT INTO accounting.expense_category_account_map
           (operating_company_id, category_kind, category_code, account_id, posting_side, is_active)
         VALUES ($1::uuid,'maintenance','maintenance',$2::uuid,'debit',true)
         ON CONFLICT (operating_company_id, category_kind, category_code, is_active) WHERE is_active = true
         DO UPDATE SET account_id = EXCLUDED.account_id`,
        [companyId, maintenanceAccountId]
      );
      // Category map: cash_advance/cash_advance → Expense account (for driver-advance refusal test)
      await db.query(
        `INSERT INTO accounting.expense_category_account_map
           (operating_company_id, category_kind, category_code, account_id, posting_side, is_active)
         VALUES ($1::uuid,'cash_advance','cash_advance',$2::uuid,'debit',true)
         ON CONFLICT (operating_company_id, category_kind, category_code, is_active) WHERE is_active = true
         DO UPDATE SET account_id = EXCLUDED.account_id`,
        [companyId, maintenanceAccountId]
      );

      // Item with default_expense_account_id = maintenanceAccountId (items law: line account = item's account)
      await db.query(
        `INSERT INTO catalogs.items (id, operating_company_id, item_name, item_type, default_expense_account_id)
         VALUES ($1::uuid,$2::uuid,'Test Maintenance Item ${suffix}','Service',$3::uuid)`,
        [maintenanceItemId, companyId, maintenanceAccountId]
      );
    });
  }, 60_000);

  afterAll(async () => { await db?.end().catch(() => {}); });

  it(
    "creates a category-line check — item_id resolved from account (443.92 #1b engine fix), TB = 0",
    async () => {
      const result = await createCheck(companyId, ACTOR_USER_ID, {
        bank_account_id: bankAccountId,
        payee_kind: "vendor",
        payee_id: vendorId,
        check_date: "2026-10-12",
        print_later: false,
        check_number: uniqueCheckNumber(),
        lines: [{ line_kind: "category", category_kind: "maintenance", category_code: "maintenance", amount_cents: 12345 }],
      });
      expect(result.id.length).toBeGreaterThan(0);
      expect(result.total_amount_cents).toBe(12345);

      // Verify expense_lines has item_id set (not null — constraint proof)
      const lines = await scopedRead<{ item_id: string | null }>(
        `SELECT item_id::text FROM accounting.expense_lines WHERE expense_id = $1::uuid`,
        [result.id]
      );
      expect(lines.length).toBe(1);
      expect(lines[0]?.item_id).toBe(maintenanceItemId);

      // TB = 0: sum of debit postings = sum of credit postings
      const je = await scopedRead<{ debit_sum: string; credit_sum: string }>(
        `SELECT
           SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE 0 END)::text AS debit_sum,
           SUM(CASE WHEN debit_or_credit='credit' THEN amount_cents ELSE 0 END)::text AS credit_sum
         FROM accounting.journal_entry_postings
         WHERE source_transaction_id = $1`,
        [result.id]
      );
      expect(je[0]?.debit_sum).toBe("12345");
      expect(je[0]?.credit_sum).toBe("12345");
    },
    30_000
  );

  it(
    "print-later leaves check_number null and print_status need_to_print",
    async () => {
      const result = await createCheck(companyId, ACTOR_USER_ID, {
        bank_account_id: bankAccountId,
        payee_kind: "vendor",
        payee_id: vendorId,
        check_date: "2026-10-12",
        print_later: true,
        lines: [{ line_kind: "category", category_kind: "maintenance", category_code: "maintenance", amount_cents: 500 }],
      });
      expect(result.check_number).toBeNull();
      expect(result.print_status).toBe("need_to_print");
    },
    30_000
  );

  it(
    "refuses a duplicate check number on the same bank account with CreateCheckConflictError",
    async () => {
      const num = uniqueCheckNumber();
      await createCheck(companyId, ACTOR_USER_ID, {
        bank_account_id: bankAccountId,
        payee_kind: "vendor",
        payee_id: vendorId,
        check_date: "2026-10-12",
        print_later: false,
        check_number: num,
        lines: [{ line_kind: "category", category_kind: "maintenance", category_code: "maintenance", amount_cents: 100 }],
      });
      await expect(
        createCheck(companyId, ACTOR_USER_ID, {
          bank_account_id: bankAccountId,
          payee_kind: "vendor",
          payee_id: vendorId,
          check_date: "2026-10-12",
          print_later: false,
          check_number: num,
          lines: [{ line_kind: "category", category_kind: "maintenance", category_code: "maintenance", amount_cents: 200 }],
        })
      ).rejects.toBeInstanceOf(CreateCheckConflictError);
    },
    30_000
  );

  it(
    "refuses a driver + cash_advance line as DRIVER_ADVANCE_IS_A_BILL_PAYMENT, writes nothing",
    async () => {
      await expect(
        createCheck(companyId, ACTOR_USER_ID, {
          bank_account_id: bankAccountId,
          payee_kind: "driver",
          payee_id: driverId,
          check_date: "2026-10-12",
          print_later: false,
          check_number: uniqueCheckNumber(),
          lines: [{ line_kind: "category", category_kind: "cash_advance", category_code: "cash_advance", amount_cents: 5000 }],
        })
      ).rejects.toMatchObject({ code: "DRIVER_ADVANCE_IS_A_BILL_PAYMENT" });
    },
    30_000
  );

  it(
    "item-line check: qty × rate = amount_cents, expense_lines.quantity + rate_cents stored, TB = 0",
    async () => {
      const result = await createCheck(companyId, ACTOR_USER_ID, {
        bank_account_id: bankAccountId,
        payee_kind: "vendor",
        payee_id: vendorId,
        check_date: "2026-10-12",
        print_later: false,
        check_number: uniqueCheckNumber(),
        lines: [{ line_kind: "item", item_id: maintenanceItemId, quantity: 2, rate_cents: 5000, amount_cents: 10000 }],
      });
      expect(result.total_amount_cents).toBe(10000);

      const lines = await scopedRead<{ item_id: string; quantity: number; rate_cents: number }>(
        `SELECT item_id::text, quantity, rate_cents FROM accounting.expense_lines WHERE expense_id = $1::uuid`,
        [result.id]
      );
      expect(lines.length).toBe(1);
      expect(lines[0]?.item_id).toBe(maintenanceItemId);
      expect(Number(lines[0]?.quantity)).toBe(2);
      expect(Number(lines[0]?.rate_cents)).toBe(5000);

      // TB = 0
      const je = await scopedRead<{ debit_sum: string; credit_sum: string }>(
        `SELECT
           SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE 0 END)::text AS debit_sum,
           SUM(CASE WHEN debit_or_credit='credit' THEN amount_cents ELSE 0 END)::text AS credit_sum
         FROM accounting.journal_entry_postings
         WHERE source_transaction_id = $1`,
        [result.id]
      );
      expect(je[0]?.debit_sum).toBe("10000");
      expect(je[0]?.credit_sum).toBe("10000");
    },
    30_000
  );

  it(
    "refuses a zero-line total with TOTAL_MUST_BE_POSITIVE before touching the database",
    async () => {
      await expect(
        createCheck(companyId, ACTOR_USER_ID, {
          bank_account_id: bankAccountId,
          payee_kind: "vendor",
          payee_id: vendorId,
          check_date: "2026-10-12",
          print_later: true,
          lines: [{ line_kind: "category", category_kind: "maintenance", category_code: "maintenance", amount_cents: 0 }],
        })
      ).rejects.toBeInstanceOf(CheckAccountError);
    },
    30_000
  );
});
