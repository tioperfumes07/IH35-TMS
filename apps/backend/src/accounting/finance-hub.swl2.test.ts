import { describe, expect, it, vi, beforeEach } from "vitest";

// SWL-2: a cash-flow read failure must NOT render as a real $0 cash position. It must surface as an
// explicit "Unavailable" (text) KPI and be logged. A genuine $0 still comes back as money_cents 0.
const { errorMock } = vi.hoisted(() => ({ errorMock: vi.fn() }));
vi.mock("../observability/structured-logger.js", () => ({
  logger: { error: (...a: unknown[]) => errorMock(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { cashFlowMock } = vi.hoisted(() => ({ cashFlowMock: vi.fn() }));
vi.mock("./cash-flow.service.js", () => ({
  getCashFlowReport: (...a: unknown[]) => cashFlowMock(...a),
}));

// withCurrentUser(userId, cb) → run the callback with a stub client that returns empty rows for
// every KPI read (all non-cash KPIs then compute to their zero/empty defaults — unrelated to SWL-2).
vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, cb: (client: unknown) => Promise<unknown>) =>
    cb({ query: async () => ({ rows: [] }) }),
}));

vi.mock("../lib/company-business-date.js", () => ({ companyBusinessDate: () => "2026-07-05" }));

import { getFinanceHubOverview } from "./finance-hub.service.js";

const INPUT = { userId: "u-1", operating_company_id: "oci" };

describe("SWL-2 finance-hub — cash-flow failure surfaces Unavailable, not a false $0", () => {
  beforeEach(() => {
    errorMock.mockClear();
    cashFlowMock.mockReset();
  });

  it("on cash-flow failure: cash_position KPI is text 'Unavailable' + logged (never money $0)", async () => {
    cashFlowMock.mockRejectedValueOnce(new Error("cash-flow read failed"));

    const overview = await getFinanceHubOverview(INPUT);
    const cash = overview.kpis.find((k) => k.key === "cash_position")!;

    expect(cash.value_kind).toBe("text");
    expect(cash.value).toBe("Unavailable");
    expect(cash.secondary).toMatch(/couldn't load/i);

    expect(errorMock).toHaveBeenCalledTimes(1);
    const [, , ctx] = errorMock.mock.calls[0];
    expect(ctx).toMatchObject({ company_id: "oci", surface: "accounting.getFinanceHubOverview.cash_position" });
  });

  it("on success: a genuine $0 is money_cents 0, not Unavailable (dormant-zero distinction)", async () => {
    cashFlowMock.mockResolvedValueOnce({ cash_at_end: 0 });

    const overview = await getFinanceHubOverview(INPUT);
    const cash = overview.kpis.find((k) => k.key === "cash_position")!;

    expect(cash.value_kind).toBe("money_cents");
    expect(cash.value).toBe(0);
    expect(errorMock).not.toHaveBeenCalled();
  });
});
