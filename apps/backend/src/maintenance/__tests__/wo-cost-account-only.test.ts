/**
 * LEAD RULING 2026-10-17 15:10Z #1 (ACCT-F92 stands): a work-order cost line posts to a COST account only.
 * 443.159 put Section A on the full Chart of Accounts; the picker now scopes WO mode to cost accounts, and the
 * money writer refuses a non-cost account itself — it never trusts the UI.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn() }));

import {
  WO_COST_ACCOUNT_TYPES_NORMALIZED,
  WorkOrderLineItemError,
  assertWorkOrderCostAccount,
  createWorkOrderWithLines,
} from "../two-section-service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACCT = "11111111-1111-4111-8111-111111111111";

type Acct = { account_name: string; account_type: string | null; is_postable: boolean | null } | null;

/** Emulates the catalogs.accounts lookup: is_cost = normalized type ∈ the $3 list the writer sends. */
function makeClient(acct: Acct) {
  const calls: string[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push(sql);
    if (sql.includes("FROM catalogs.accounts a")) {
      if (!acct) return { rows: [] };
      const list = (params?.[2] as string[]) ?? [];
      const norm = String(acct.account_type ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      return { rows: [{ ...acct, is_cost: list.includes(norm) }] };
    }
    return { rows: [{ display_id: "WO-1", sequence: 1, id: "wo-1", ok: false }], rowCount: 1 };
  });
  return { client: { query } as never, calls };
}

async function refusal(acct: Acct) {
  const { client } = makeClient(acct);
  try {
    await assertWorkOrderCostAccount(client, OPCO, ACCT);
    return null;
  } catch (err) {
    return err;
  }
}

describe("assertWorkOrderCostAccount", () => {
  it("sends the normalized cost-type list", () => {
    expect([...WO_COST_ACCOUNT_TYPES_NORMALIZED].sort()).toEqual(["costofgoodssold", "expense", "otherexpense"]);
  });

  it("refuses an Income account (4210-4240 Detention/Layover/Lumper/TONU) by name", async () => {
    const err = await refusal({ account_name: "Detention Income", account_type: "Income", is_postable: true });
    expect(err).toBeInstanceOf(WorkOrderLineItemError);
    expect((err as WorkOrderLineItemError).code).toBe("wo_line_account_not_cost");
    expect((err as Error).message).toContain("Detention Income");
  });

  it("refuses Other Income in either spelling, Asset and Liability", async () => {
    for (const t of ["OtherIncome", "Other Income", "Asset", "Liability", "Equity"]) {
      expect(await refusal({ account_name: "X", account_type: t, is_postable: true })).toBeInstanceOf(WorkOrderLineItemError);
    }
  });

  it("accepts Expense / Cost of Goods Sold / Other Expense in both spellings", async () => {
    for (const t of ["Expense", "CostOfGoodsSold", "Cost of Goods Sold", "OtherExpense", "Other Expense"]) {
      expect(await refusal({ account_name: "Repairs", account_type: t, is_postable: true })).toBeNull();
    }
  });

  it("refuses a non-postable header cost account", async () => {
    expect(await refusal({ account_name: "Repairs (header)", account_type: "Expense", is_postable: false })).toBeInstanceOf(
      WorkOrderLineItemError
    );
  });

  it("leaves a non-account id (legacy expense category) and an empty id to the category paths", async () => {
    expect(await refusal(null)).toBeNull();
    const { client, calls } = makeClient(null);
    await assertWorkOrderCostAccount(client, OPCO, null);
    expect(calls).toHaveLength(0);
  });
});

describe("createWorkOrderWithLines — the one Section A writer", () => {
  it("refuses an Income Section A line before any work_order_lines row is written", async () => {
    const { client, calls } = makeClient({ account_name: "Lumper Income", account_type: "Income", is_postable: true });
    await expect(
      createWorkOrderWithLines(
        client,
        "user-1",
        { operating_company_id: OPCO, unit_id: "unit-1", source_type: "RS" } as never,
        [{ description: "Lumper", quantity: 1, amount: 100, expense_category_uuid: ACCT }],
        []
      )
    ).rejects.toMatchObject({ code: "wo_line_account_not_cost" });
    expect(calls.some((sql) => sql.includes("INSERT INTO maintenance.work_order_lines"))).toBe(false);
  });
});
