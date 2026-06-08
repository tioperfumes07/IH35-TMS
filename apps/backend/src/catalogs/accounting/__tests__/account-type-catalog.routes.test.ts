import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerAccountTypeCatalogRoutes } from "../account-type-catalog.routes.js";

// ─── DB mock ──────────────────────────────────────────────────────────────────

const BANK_DETAIL_TYPES = [
  "Cash on hand",
  "Checking",
  "Money Market",
  "Rents Held in Trust",
  "Savings",
  "Trust account",
];

// Minimal flat join rows matching what the SQL query returns
const mockRows = [
  // ASSET
  { at_id: "id-01", code: "BANK", at_name: "Bank",                       group_label: "ASSET",    statement: "BS",  normal_balance: "Debit",  default_action: "view_register", at_sort: 10,  dt_id: "dt-01", dt_name: "Cash on hand",         dt_sort: 10 },
  { at_id: "id-01", code: "BANK", at_name: "Bank",                       group_label: "ASSET",    statement: "BS",  normal_balance: "Debit",  default_action: "view_register", at_sort: 10,  dt_id: "dt-02", dt_name: "Checking",              dt_sort: 20 },
  { at_id: "id-01", code: "BANK", at_name: "Bank",                       group_label: "ASSET",    statement: "BS",  normal_balance: "Debit",  default_action: "view_register", at_sort: 10,  dt_id: "dt-03", dt_name: "Money Market",          dt_sort: 30 },
  { at_id: "id-01", code: "BANK", at_name: "Bank",                       group_label: "ASSET",    statement: "BS",  normal_balance: "Debit",  default_action: "view_register", at_sort: 10,  dt_id: "dt-04", dt_name: "Rents Held in Trust",   dt_sort: 40 },
  { at_id: "id-01", code: "BANK", at_name: "Bank",                       group_label: "ASSET",    statement: "BS",  normal_balance: "Debit",  default_action: "view_register", at_sort: 10,  dt_id: "dt-05", dt_name: "Savings",               dt_sort: 50 },
  { at_id: "id-01", code: "BANK", at_name: "Bank",                       group_label: "ASSET",    statement: "BS",  normal_balance: "Debit",  default_action: "view_register", at_sort: 10,  dt_id: "dt-06", dt_name: "Trust account",         dt_sort: 60 },
  { at_id: "id-02", code: "AR",   at_name: "Accounts receivable (A/R)",  group_label: "ASSET",    statement: "BS",  normal_balance: "Debit",  default_action: "view_register", at_sort: 20,  dt_id: "dt-07", dt_name: "Accounts Receivable (A/R)", dt_sort: 10 },
  { at_id: "id-03", code: "OCA",  at_name: "Other Current Assets",       group_label: "ASSET",    statement: "BS",  normal_balance: "Debit",  default_action: "view_register", at_sort: 30,  dt_id: "dt-08", dt_name: "Inventory",             dt_sort: 50 },
  { at_id: "id-04", code: "FA",   at_name: "Fixed Assets",               group_label: "ASSET",    statement: "BS",  normal_balance: "Debit",  default_action: "view_register", at_sort: 40,  dt_id: "dt-09", dt_name: "Vehicles",              dt_sort: 110 },
  { at_id: "id-05", code: "OA",   at_name: "Other Assets",               group_label: "ASSET",    statement: "BS",  normal_balance: "Debit",  default_action: "view_register", at_sort: 50,  dt_id: "dt-10", dt_name: "Goodwill",              dt_sort: 20 },
  // LIABILITY
  { at_id: "id-06", code: "CC",   at_name: "Credit Card",                group_label: "LIABILITY", statement: "BS", normal_balance: "Credit", default_action: "view_register", at_sort: 60,  dt_id: "dt-11", dt_name: "Credit Card",           dt_sort: 10 },
  { at_id: "id-07", code: "AP",   at_name: "Accounts payable (A/P)",     group_label: "LIABILITY", statement: "BS", normal_balance: "Credit", default_action: "view_register", at_sort: 70,  dt_id: "dt-12", dt_name: "Accounts Payable (A/P)", dt_sort: 10 },
  { at_id: "id-08", code: "OCL",  at_name: "Other Current Liabilities",  group_label: "LIABILITY", statement: "BS", normal_balance: "Credit", default_action: "view_register", at_sort: 80,  dt_id: "dt-13", dt_name: "Sales Tax Payable",     dt_sort: 130 },
  { at_id: "id-09", code: "LTL",  at_name: "Long Term Liabilities",      group_label: "LIABILITY", statement: "BS", normal_balance: "Credit", default_action: "view_register", at_sort: 90,  dt_id: "dt-14", dt_name: "Notes Payable",         dt_sort: 10 },
  // EQUITY
  { at_id: "id-10", code: "EQ",   at_name: "Equity",                     group_label: "EQUITY",   statement: "BS",  normal_balance: "Credit", default_action: "view_register", at_sort: 100, dt_id: "dt-15", dt_name: "Retained Earnings",     dt_sort: 150 },
  // INCOME
  { at_id: "id-11", code: "INC",  at_name: "Income",                     group_label: "INCOME",   statement: "P&L", normal_balance: "Credit", default_action: "run_report",    at_sort: 110, dt_id: "dt-16", dt_name: "Service/Fee Income",    dt_sort: 50 },
  { at_id: "id-12", code: "OINC", at_name: "Other Income",               group_label: "INCOME",   statement: "P&L", normal_balance: "Credit", default_action: "run_report",    at_sort: 120, dt_id: "dt-17", dt_name: "Interest Earned",       dt_sort: 20 },
  // EXPENSE
  { at_id: "id-13", code: "COGS", at_name: "Cost of Goods Sold",         group_label: "EXPENSE",  statement: "P&L", normal_balance: "Debit",  default_action: "run_report",    at_sort: 130, dt_id: "dt-18", dt_name: "Cost of labor - COS",   dt_sort: 10 },
  { at_id: "id-14", code: "EXP",  at_name: "Expenses",                   group_label: "EXPENSE",  statement: "P&L", normal_balance: "Debit",  default_action: "run_report",    at_sort: 140, dt_id: "dt-19", dt_name: "Utilities",             dt_sort: 310 },
  { at_id: "id-15", code: "OEXP", at_name: "Other Expense",              group_label: "EXPENSE",  statement: "P&L", normal_balance: "Debit",  default_action: "run_report",    at_sort: 150, dt_id: "dt-20", dt_name: "Depreciation",          dt_sort: 20 },
];

const queryMock = vi.fn(async () => ({ rows: mockRows }));

vi.mock("../../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

// ─── tests ────────────────────────────────────────────────────────────────────

describe("GET /api/v1/accounting/account-type-catalog", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    queryMock.mockClear();
  });

  async function buildApp() {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Owner",
      };
    });
    registerAccountTypeCatalogRoutes(app);
    await app.ready();
    return app;
  }

  it("returns HTTP 200", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/accounting/account-type-catalog" });
    expect(res.statusCode).toBe(200);
  });

  it("returns exactly 15 account types", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/accounting/account-type-catalog" });
    const body = res.json<Array<{ code: string }>>();
    expect(body).toHaveLength(15);
  });

  it("returns exactly 5 distinct groups", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/accounting/account-type-catalog" });
    const body = res.json<Array<{ group: string }>>();
    const groups = new Set(body.map((r) => r.group));
    expect(groups).toEqual(new Set(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]));
  });

  it("every account type has at least 1 detail type", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/accounting/account-type-catalog" });
    const body = res.json<Array<{ code: string; detailTypes: unknown[] }>>();
    for (const at of body) {
      expect(at.detailTypes.length, `${at.code} must have >=1 detail type`).toBeGreaterThanOrEqual(1);
    }
  });

  it("Bank account type has exactly the 6 QBO-spec detail types", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/accounting/account-type-catalog" });
    const body = res.json<Array<{ code: string; detailTypes: Array<{ name: string }> }>>();
    const bank = body.find((r) => r.code === "BANK");
    expect(bank).toBeDefined();
    const dtNames = bank!.detailTypes.map((d) => d.name).sort();
    expect(dtNames).toEqual([...BANK_DETAIL_TYPES].sort());
  });

  it("response shape contains expected fields on each entry", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/accounting/account-type-catalog" });
    const body = res.json<Array<Record<string, unknown>>>();
    const first = body[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("code");
    expect(first).toHaveProperty("accountType");
    expect(first).toHaveProperty("group");
    expect(first).toHaveProperty("statement");
    expect(first).toHaveProperty("normalBalance");
    expect(first).toHaveProperty("defaultAction");
    expect(first).toHaveProperty("detailTypes");
    expect(Array.isArray(first.detailTypes)).toBe(true);
  });
});
