// Real Postgres proof for check-void.service.ts — isolated company, no hardcoded USMCA UUIDs.
// CheckPayeeError fixture fix (443.92 #1): seeds all required rows in beforeAll so the test
// runs on any migrated DB (CI ephemeral or Neon rehearsal branch).
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { createIsolatedOperatingCompany, ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { insertMaintenanceCategoryMap } from "../../../../test-helpers/isolated-company.js";
import { withLuciaBypass } from "../../../auth/db.js";
import { createCheck } from "../check-create.service.js";
import { voidCheck, reissueCheck, CheckVoidError } from "../check-void.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("check-void.service (real Postgres, isolated company)", () => {
  let db: pg.Client;
  let companyId: string;
  const vendorId = randomUUID();
  const bankAccountId = randomUUID();
  const cashAccountId = randomUUID();
  const apAccountId = randomUUID();
  const maintenanceAccountId = randomUUID();
  const maintenanceItemId = randomUUID();
  const actorUserId = randomUUID();
  const suffix = randomUUID().slice(0, 6);

  function uniqueCheckNumber(): string {
    return `VOID-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { await fn(); await db.query("COMMIT"); }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  async function seedCheck(): Promise<string> {
    const result = await createCheck(companyId, actorUserId, {
      bank_account_id: bankAccountId,
      payee_kind: "vendor",
      payee_id: vendorId,
      check_date: "2026-10-12",
      print_later: false,
      check_number: uniqueCheckNumber(),
      lines: [{ line_kind: "category", category_kind: "maintenance", category_code: "maintenance", amount_cents: 999 }],
    });
    return result.id;
  }

  async function seedItemCheck(): Promise<string> {
    const result = await createCheck(companyId, actorUserId, {
      bank_account_id: bankAccountId,
      payee_kind: "vendor",
      payee_id: vendorId,
      check_date: "2026-10-12",
      print_later: false,
      check_number: uniqueCheckNumber(),
      lines: [{ line_kind: "item", item_id: maintenanceItemId, quantity: 1, rate_cents: 2000, amount_cents: 2000 }],
    });
    return result.id;
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const isolated = await createIsolatedOperatingCompany({ label: "chkvoid" });
    companyId = isolated.companyId;
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();

    await bypass(async () => {
      // Actor user (stampDocumentVoided validates it against identity.users)
      await db.query("SET LOCAL app.allow_owner_bootstrap = '1'");
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language)
         VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [actorUserId, `chkvoid-${suffix}@test.local`]
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

      // AP control role binding
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

      // Category map: maintenance/maintenance + its 9 sub-codes → Expense account (one statement; 443.100)
      await insertMaintenanceCategoryMap(db, companyId, maintenanceAccountId);

      // Item (items law: expense_lines_item_id_required)
      await db.query(
        `INSERT INTO catalogs.items (id, operating_company_id, item_name, item_type, default_expense_account_id)
         VALUES ($1::uuid,$2::uuid,'Test Maintenance Item ${suffix}','Service',$3::uuid)`,
        [maintenanceItemId, companyId, maintenanceAccountId]
      );
      // DEGH-04 (443.113): a check exists only if it posts, so the fixture company has expense GL posting ON (as the owner's does).
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ('EXPENSE_GL_POSTING_ENABLED', $1::uuid, NULL, true, $2::uuid)`,
        [companyId, actorUserId]
      );
    });
  }, 60_000);

  afterAll(async () => { await db?.end().catch(() => {}); });

  it(
    "voids a check: reversal JE exists iff it was actually posted, status flips to void, registry flips to voided",
    async () => {
      const checkId = await seedCheck();

      const beforeVoid = await withLuciaBypass(async (client) => {
        const res = await client.query(`SELECT posting_status, journal_entry_id::text FROM accounting.expenses WHERE id = $1::uuid`, [checkId]);
        return res.rows[0] as { posting_status: string; journal_entry_id: string | null };
      });

      const result = await voidCheck(companyId, actorUserId, checkId, "test void -- isolated");
      if (beforeVoid.posting_status === "posted") {
        expect(result.reversal_journal_entry_id).not.toBeNull();
        expect(result.reversal_journal_entry_id).not.toBe(beforeVoid.journal_entry_id);
      } else {
        expect(result.reversal_journal_entry_id).toBeNull();
      }

      const row = await withLuciaBypass(async (client) => {
        const res = await client.query(`SELECT status, memo, voided_at, void_reason FROM accounting.expenses WHERE id = $1::uuid`, [checkId]);
        return res.rows[0] as { status: string; memo: string; voided_at: string | null; void_reason: string };
      });
      expect(row.status).toBe("void");
      expect(row.voided_at).not.toBeNull();
      expect(row.memo.startsWith("VOID:")).toBe(true);
      expect(row.void_reason).toBe("test void -- isolated");

      const registryStatus = await withLuciaBypass(async (client) => {
        const res = await client.query(
          `SELECT status FROM banking.check_number_registry WHERE operating_company_id = $1::uuid AND source_kind = 'check' AND source_id = $2::uuid`,
          [companyId, checkId]
        );
        return res.rows[0]?.status as string | undefined;
      });
      expect(registryStatus).toBe("voided");
    },
    30_000
  );

  it(
    "refuses to void an already-void check with CHECK_ALREADY_VOID",
    async () => {
      const checkId = await seedCheck();
      await voidCheck(companyId, actorUserId, checkId, "first void");
      await expect(voidCheck(companyId, actorUserId, checkId, "second void")).rejects.toMatchObject({
        code: "CHECK_ALREADY_VOID",
      });
    },
    30_000
  );

  it(
    "voids an item-line check (qty × rate = 2000): status=void, reversal JE TB = 0",
    async () => {
      const checkId = await seedItemCheck();
      const result = await voidCheck(companyId, actorUserId, checkId, "item-line void test");

      const row = await withLuciaBypass(async (client) => {
        const res = await client.query(`SELECT status FROM accounting.expenses WHERE id = $1::uuid`, [checkId]);
        return res.rows[0] as { status: string };
      });
      expect(row.status).toBe("void");

      if (result.reversal_journal_entry_id) {
        const je = await withLuciaBypass(async (client) => {
          const res = await client.query(
            `SELECT
               SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE 0 END)::text AS debit_sum,
               SUM(CASE WHEN debit_or_credit='credit' THEN amount_cents ELSE 0 END)::text AS credit_sum
             FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid`,
            [result.reversal_journal_entry_id]
          );
          return res.rows[0] as { debit_sum: string; credit_sum: string };
        });
        expect(je.debit_sum).toBe(je.credit_sum);
      }
    },
    30_000
  );

  it(
    "reissue voids the original and creates a genuinely new check id + number",
    async () => {
      const originalId = await seedCheck();
      const result = await reissueCheck(companyId, actorUserId, originalId, "printer jam, reissuing", {
        operating_company_id: companyId,
        bank_account_id: bankAccountId,
        payee_kind: "vendor",
        payee_id: vendorId,
        check_date: "2026-10-12",
        print_later: false,
        check_number: uniqueCheckNumber(),
        lines: [{ line_kind: "category", category_kind: "maintenance", category_code: "maintenance", amount_cents: 999 }],
      });
      expect(result.reissued.id).not.toBe(originalId);

      const originalStatus = await withLuciaBypass(async (client) => {
        const res = await client.query(`SELECT status FROM accounting.expenses WHERE id = $1::uuid`, [originalId]);
        return res.rows[0]?.status as string;
      });
      expect(originalStatus).toBe("void");
    },
    30_000
  );

  it(
    "reissue without explicit lines refuses REISSUE_LINES_REQUIRED rather than guessing a category",
    async () => {
      const originalId = await seedCheck();
      await expect(
        reissueCheck(
          companyId,
          actorUserId,
          originalId,
          "reissue, no lines given",
          {
            operating_company_id: companyId,
            bank_account_id: bankAccountId,
            payee_kind: "vendor",
            payee_id: vendorId,
            check_date: "2026-10-12",
            print_later: true,
          } as never
        )
      ).rejects.toBeInstanceOf(CheckVoidError);
    },
    30_000
  );
});
