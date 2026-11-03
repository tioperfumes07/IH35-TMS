import { beforeEach, describe, expect, it, vi } from "vitest";

// Row 54 (ACCT-F11051): the trial-balance export is the same period the viewer shows.
const getTrialBalanceReportMock = vi.fn();
const renderXlsxMock = vi.fn();

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_u: string, fn: (c: unknown) => unknown) =>
    fn({ query: async (sql: string) => (/FROM org\.companies/.test(sql) ? { rows: [{ code: "USMCA" }] } : { rows: [] }) }),
}));
vi.mock("../trial-balance.service.js", () => ({
  getTrialBalanceReport: (...args: unknown[]) => getTrialBalanceReportMock(...args),
}));
vi.mock("../statement-export-xlsx.service.js", () => ({
  renderStatementXlsx: (...args: unknown[]) => renderXlsxMock(...args),
}));
vi.mock("../statement-export-pdf.service.js", () => ({ renderStatementPdf: async () => Buffer.from("pdf") }));

const { exportTrialBalanceStatement } = await import("../statement-export.service.js");

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";

describe("trial balance export period", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTrialBalanceReportMock.mockResolvedValue({
      rows: [{ account_id: "a", account_code: "1000", account_name: "Bank", account_type: "Asset", total_debits: 500, total_credits: 200, net_balance: 300 },
             { account_id: "b", account_code: "4000", account_name: "Revenue", account_type: "Income", total_debits: 200, total_credits: 500, net_balance: -300 }],
      summary: { grand_total_debits: 700, grand_total_credits: 700, balanced: true },
    });
    renderXlsxMock.mockResolvedValue(Buffer.from("xlsx"));
  });

  it("passes from_date to the one trial-balance query and names the period", async () => {
    const res = await exportTrialBalanceStatement({ userId: "u", operating_company_id: CO, from_date: "2026-10-01", as_of_date: "2026-12-31", format: "xlsx" });
    expect(getTrialBalanceReportMock).toHaveBeenCalledWith({ userId: "u", operating_company_id: CO, from_date: "2026-10-01", to_date: "2026-12-31" });
    expect(res.filename).toContain("2026-10-01_to_2026-12-31");
    const rows = renderXlsxMock.mock.calls[0][0].rows as unknown[][];
    expect(rows).toContainEqual(["Period", "2026-10-01 to 2026-12-31"]);
    expect(rows.at(-1)).toEqual(["Totals", "", "", 7, 7, ""]);
  });

  it("without from_date keeps the as-of read", async () => {
    const res = await exportTrialBalanceStatement({ userId: "u", operating_company_id: CO, as_of_date: "2026-11-03", format: "xlsx" });
    expect(getTrialBalanceReportMock).toHaveBeenCalledWith({ userId: "u", operating_company_id: CO, from_date: undefined, to_date: "2026-11-03" });
    expect(res.filename).toContain("as-of_2026-11-03");
  });
});
