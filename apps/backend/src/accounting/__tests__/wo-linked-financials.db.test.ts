/**
 * WO ↔ Bill/Expense HARD cross-module link (migration 202607050810) against real Postgres.
 *
 * Proves the hardened link end-to-end:
 *   1. REVERSE drill-through — listWorkOrderLinkedFinancials returns the bills + expenses whose
 *      linked_work_order_uuid FK points at a given work order, entity-scoped, and EXCLUDES an
 *      unlinked bill (no false positives) and a revoked bill / void expense.
 *   2. HARD FK enforcement — inserting a bill (or expense) with linked_work_order_uuid pointing at a
 *      NON-existent work order is REJECTED by the new FK constraint (the soft link is now hard).
 *   3. unit_id FK — a bad unit_id is likewise rejected.
 *
 * Seeds directly via SQL under app.bypass_rls='lucia' (matches expenses-list-readonly.db.test.ts),
 * then runs the reverse-lookup service under REAL RLS. CI-only (needs the full migration chain).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites, getIntegrationWorkOrderSeedIds } from "../../../test-helpers/db-fixture.js";
import { listWorkOrderLinkedFinancials } from "../bills.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("WO↔bill/expense hard FK link (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  let unitId: string;
  let driverId: string;
  let workOrderId: string;
  const actorUserId = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try {
      const result = await fn();
      await db.query("COMMIT");
      return result;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    ({ unitId, driverId } = await getIntegrationWorkOrderSeedIds());

    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL!;
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");

    workOrderId = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO maintenance.work_orders (id, operating_company_id, wo_type, status, unit_id, driver_id, display_id)
         VALUES ($1::uuid, $2::uuid, 'repair', 'open', $3::uuid, $4::uuid, $5)`,
        [workOrderId, companyId, unitId, driverId, `WO-LINK-${suffix}`]
      );
    });
  });

  afterAll(async () => {
    await db?.end();
  });

  async function seedBill(link: string | null, unit: string | null, opts?: { revoked?: boolean }): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO accounting.bills
           (id, operating_company_id, bill_number, bill_date, amount_cents, total_amount, status, linked_work_order_uuid, unit_id, revoked_at)
         VALUES ($1::uuid, $2::uuid, $3, CURRENT_DATE, 12345, 123.45, 'unpaid', $4::uuid, $5::uuid, $6)`,
        [id, companyId, `BILL-${suffix}-${id.slice(0, 4)}`, link, unit, opts?.revoked ? new Date().toISOString() : null]
      );
    });
    return id;
  }

  async function seedExpense(link: string | null, status = "posted"): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO accounting.expenses
           (id, operating_company_id, driver_uuid, transaction_date, total_amount_cents, status, linked_work_order_uuid, memo)
         VALUES ($1::uuid, $2::uuid, $3::uuid, CURRENT_DATE, 6789, $4, $5::uuid, $6)`,
        [id, companyId, driverId, status, link, `EXP-${suffix}`]
      );
    });
    return id;
  }

  it("reverse drill-through returns only the FK-linked, non-voided bills + expenses", async () => {
    const linkedBill = await seedBill(workOrderId, unitId);
    const unlinkedBill = await seedBill(null, null);
    const revokedLinkedBill = await seedBill(workOrderId, unitId, { revoked: true });
    const linkedExpense = await seedExpense(workOrderId);
    const voidLinkedExpense = await seedExpense(workOrderId, "void");

    const result = await listWorkOrderLinkedFinancials(actorUserId, companyId, workOrderId);

    const billIds = result.bills.map((b) => b.id);
    expect(billIds).toContain(linkedBill);
    expect(billIds).not.toContain(unlinkedBill); // no false positive
    expect(billIds).not.toContain(revokedLinkedBill); // revoked excluded

    const expenseIds = result.expenses.map((e) => e.id);
    expect(expenseIds).toContain(linkedExpense);
    expect(expenseIds).not.toContain(voidLinkedExpense); // void excluded
  });

  it("HARD FK rejects a bill whose linked_work_order_uuid points at a non-existent work order", async () => {
    await expect(seedBill(randomUUID(), null)).rejects.toMatchObject({ code: "23503" }); // FK violation
  });

  it("HARD FK rejects a bill whose unit_id points at a non-existent unit", async () => {
    await expect(seedBill(null, randomUUID())).rejects.toMatchObject({ code: "23503" });
  });

  it("HARD FK rejects an expense whose linked_work_order_uuid points at a non-existent work order", async () => {
    await expect(seedExpense(randomUUID())).rejects.toMatchObject({ code: "23503" });
  });
});
