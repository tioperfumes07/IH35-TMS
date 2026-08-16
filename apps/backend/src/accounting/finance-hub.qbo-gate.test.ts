import { describe, expect, it, vi, beforeEach } from "vitest";

// LV-USMCA-FINANCE-HUB-EXPOSES-QBO-SYNC-KPI: a company with no integrations.qbo_connections row
// (e.g. TMS-native USMCA — closed entity law, no QuickBooks) must never receive a qbo_sync_health
// KPI card or a fabricated "In sync" status. A company that HAS connected QBO must still see it.

const { hasQboMock } = vi.hoisted(() => ({ hasQboMock: vi.fn() }));
vi.mock("../integrations/qbo/qbo-oauth.service.js", () => ({
  companyHasQboConnectionRecord: (...a: unknown[]) => hasQboMock(...a),
}));

vi.mock("./cash-flow.service.js", () => ({
  getCashFlowReport: async () => ({ cash_at_end: 0 }),
}));

vi.mock("../observability/structured-logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("../lib/company-business-date.js", () => ({ companyBusinessDate: () => "2026-08-16" }));

// withCurrentUser(userId, cb) -> stub client returning empty rows for every non-QBO KPI read.
const { qboQueryMock } = vi.hoisted(() => ({ qboQueryMock: vi.fn() }));
vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, cb: (client: unknown) => Promise<unknown>) =>
    cb({
      query: async (sql: string) => {
        if (sql.includes("qbo_sync_health")) qboQueryMock(sql);
        return { rows: [] };
      },
    }),
}));

import { getFinanceHubOverview } from "./finance-hub.service.js";

const INPUT = { userId: "u-1", operating_company_id: "oci" };

describe("LV-USMCA-FINANCE-HUB-EXPOSES-QBO-SYNC-KPI — qbo_sync_health gated on real connection", () => {
  beforeEach(() => {
    hasQboMock.mockReset();
    qboQueryMock.mockClear();
  });

  it("company with NO QBO connection record: no qbo_sync_health KPI, no views.qbo_sync_health read", async () => {
    hasQboMock.mockResolvedValueOnce(false);

    const overview = await getFinanceHubOverview(INPUT);

    expect(overview.kpis.find((k) => k.key === "qbo_sync_health")).toBeUndefined();
    expect(qboQueryMock).not.toHaveBeenCalled();
    expect(hasQboMock).toHaveBeenCalledWith("oci");
  });

  it("company WITH a QBO connection record: qbo_sync_health KPI present, real read issued", async () => {
    hasQboMock.mockResolvedValueOnce(true);

    const overview = await getFinanceHubOverview(INPUT);

    const kpi = overview.kpis.find((k) => k.key === "qbo_sync_health");
    expect(kpi).toBeDefined();
    expect(kpi?.value_kind).toBe("text");
    expect(qboQueryMock).toHaveBeenCalledTimes(1);
  });
});
