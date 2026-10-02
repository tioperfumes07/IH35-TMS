import { describe, expect, it, vi } from "vitest";
import { previewSettlementCreator } from "../settlement-creator.service.js";
import type { SettlementCreatorDraft } from "../settlement-creator.types.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

function makeClient(accounts: Record<string, { id: string; account_number: string; account_name: string }>) {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM catalogs.accounts") && sql.includes("account_number = $2")) {
        const num = String(params?.[1] ?? "");
        const row = accounts[num];
        return { rows: row ? [row] : [] };
      }
      if (sql.includes("FROM catalogs.accounts") && sql.includes("WHERE id = $1")) {
        const id = String(params?.[0] ?? "");
        const row = Object.values(accounts).find((a) => a.id === id);
        return { rows: row ? [row] : [] };
      }
      // role resolver optional path — return empty so preview falls back to account numbers
      return { rows: [] };
    }),
  };
}

describe("previewSettlementCreator", () => {
  it("blocks Post when PDF company expenses do not match projected fuel+comp exp", async () => {
    const client = makeClient({
      "1295": { id: "a-relay", account_number: "1295", account_name: "Relay" },
      "5000": { id: "a-fuel", account_number: "5000", account_name: "Fuel" },
      "6100": { id: "a-exp", account_number: "6100", account_name: "Expense" },
      "6890": { id: "a-pay", account_number: "6890", account_name: "Driver pay" },
      "2100": { id: "a-ap", account_number: "2100", account_name: "Driver payable" },
    });
    const draft: SettlementCreatorDraft = {
      operating_company_id: USMCA,
      settlement_no: "5806",
      driver_id: "11111111-1111-4111-8111-111111111111",
      period_start: "2026-09-01",
      period_end: "2026-09-07",
      loads: [
        {
          load_number: "13570",
          factoring: "direct",
          loaded_miles: 100,
          line_haul_rate_cents: 50,
        },
      ],
      fuel_purchases: [
        {
          date: "2026-09-02",
          gallons: 10,
          cpg_cents: 300,
          receipt_cents: 3000,
          card: "relay",
          load_number: "13570",
        },
      ],
      expenses: [],
      deductions: [],
      reimbursements: [],
      escrow: [],
      advances: [],
      pdf_company_expenses_cents: 9999,
      pdf_driver_net_cents: 5000,
    };
    const preview = await previewSettlementCreator(client as never, draft);
    expect(preview.company_expenses_matches_pdf).toBe(false);
    expect(preview.can_post).toBe(false);
    expect(preview.blockers.some((b) => /Company EXPENSES/i.test(b))).toBe(true);
  });

  const baseDraft = (escrowCents: number): SettlementCreatorDraft => ({
    operating_company_id: USMCA,
    settlement_no: "5806",
    driver_id: "11111111-1111-4111-8111-111111111111",
    period_start: "2026-09-01",
    period_end: "2026-09-07",
    loads: [{ load_number: "13570", factoring: "direct", loaded_miles: 100, line_haul_rate_cents: 50 }],
    fuel_purchases: [],
    confirmed_zero_fuel_purchases: true,
    expenses: [],
    deductions: [],
    reimbursements: [],
    escrow: [{ description: "Driver escrow", amount_cents: escrowCents, load_number: "" }],
    advances: [],
    pdf_company_expenses_cents: 0,
    pdf_driver_net_cents: 0,
  });

  it("queue item 6: the escrow line credits the driver's own 2100-00-0NN liability, never the shared default / 2400", async () => {
    const base = makeClient({
      "2400": { id: "a-shared", account_number: "2400", account_name: "Shared escrow default" },
      "2100-00-007": { id: "a-drv-escrow", account_number: "2100-00-007", account_name: "Escrow — driver 007" },
    });
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("FROM accounting.escrow_accounts")) {
          return { rows: [{ account_id: "a-drv-escrow", account_type: "Liability", account_name: "Escrow — driver 007", qbo_account_id: null }] };
        }
        return base.query(sql, params);
      }),
    };
    const preview = await previewSettlementCreator(client as never, baseDraft(2_500));
    const credit = preview.je_lines.find((l) => l.section === "escrow" && l.credit_cents === 2_500);
    expect(credit?.account_number).toBe("2100-00-007");
    expect(preview.je_lines.some((l) => l.account_number === "2400")).toBe(false);
  });

  it("queue item 6: a driver with no escrow sub-account is a blocker by name — no fallback account", async () => {
    const client = makeClient({ "2400": { id: "a-shared", account_number: "2400", account_name: "Shared escrow default" } });
    const preview = await previewSettlementCreator(client as never, baseDraft(2_500));
    expect(preview.can_post).toBe(false);
    expect(preview.blockers.some((b) => /Driver escrow:.*2100-00-0NN/.test(b))).toBe(true);
    expect(preview.je_lines.some((l) => l.account_number === "2400")).toBe(false);
  });
});
