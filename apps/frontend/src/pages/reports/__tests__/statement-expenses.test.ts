import { beforeEach, describe, expect, it, vi } from "vitest";
import { listExpenses, type ExpenseListRow } from "../../../api/accounting";
import { listExpensesForStatement } from "../statement-expenses";

vi.mock("../../../api/accounting", () => ({ listExpenses: vi.fn() }));
const row = (id: string) => ({ id } as ExpenseListRow);

describe("statement expense history", () => {
  beforeEach(() => vi.resetAllMocks());
  it("reads every page with the same company, vendor, active status and selected dates", async () => {
    const first = Array.from({ length: 200 }, (_, i) => row(`expense-${i}`));
    vi.mocked(listExpenses).mockResolvedValueOnce({ rows: first }).mockResolvedValueOnce({ rows: [row("last")] });
    const result = await listExpensesForStatement("company", "vendor", "2026-10-01", "2026-10-22");
    expect(result.rows).toHaveLength(201);
    for (const offset of [0, 200]) expect(listExpenses).toHaveBeenCalledWith("company", {
      vendor_uuid: "vendor", status: "active", date_from: "2026-10-01", date_to: "2026-10-22", limit: 200, offset,
    });
  });
  it("proves the end when the final page is exactly full", async () => {
    vi.mocked(listExpenses).mockResolvedValueOnce({ rows: Array.from({ length: 200 }, (_, i) => row(String(i))) }).mockResolvedValueOnce({ rows: [] });
    expect((await listExpensesForStatement("company", "vendor", "2026-10-01", "2026-10-22")).rows).toHaveLength(200);
    expect(listExpenses).toHaveBeenCalledTimes(2);
  });
  it("does not return a partial statement when a later page fails", async () => {
    vi.mocked(listExpenses).mockResolvedValueOnce({ rows: Array.from({ length: 200 }, (_, i) => row(String(i))) }).mockRejectedValueOnce(new Error("request failed"));
    await expect(listExpensesForStatement("company", "vendor", "2026-10-01", "2026-10-22")).rejects.toThrow("request failed");
  });
});
