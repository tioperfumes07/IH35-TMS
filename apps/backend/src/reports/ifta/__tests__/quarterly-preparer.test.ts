import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFilingCalculations } from "../quarterly-preparer.service.js";
import { registerReportsIftaRoutes } from "../routes.js";

const companyId = "44444444-4444-4444-8444-444444444444";
const filingUuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

vi.mock("../../shared.js", async () => {
  const actual = await vi.importActual<typeof import("../../shared.js")>("../../shared.js");
  return {
    ...actual,
    currentAuthUser: vi.fn(() => ({ uuid: "11111111-1111-4111-8111-111111111111", role: "Owner" })),
    withCompanyScope: vi.fn(async (_userId: string, _companyId: string, fn: (client: any) => Promise<any>) => fn(mockClient())),
  };
});

function mockClient() {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO reports.ifta_filings")) {
        return {
          rows: [
            {
              uuid: filingUuid,
              operating_company_id: companyId,
              quarter: "2026-Q2",
              status: "draft",
              filing_data: {
                total_tax_owed: 0,
                jurisdiction_rows: [],
              },
            },
          ],
        };
      }
      if (sql.includes("UPDATE reports.ifta_filings") && sql.includes("owner_approved")) {
        return {
          rows: [
            {
              uuid: filingUuid,
              status: "owner_approved",
              quarter: "2026-Q2",
            },
          ],
        };
      }
      if (sql.includes("FROM reports.ifta_filings") && sql.includes("LIMIT 1")) {
        return {
          rows: [
            {
              uuid: filingUuid,
              operating_company_id: companyId,
              quarter: "2026-Q2",
              status: "draft",
              filing_data: {
                miles_by_jurisdiction: { TX: 1000 },
                fuel_by_jurisdiction: { TX: 100 },
                miles_overrides: {},
                fuel_overrides: {},
              },
            },
          ],
        };
      }
      if (sql.includes("ORDER BY quarter DESC")) {
        return { rows: [{ uuid: filingUuid, quarter: "2026-Q2", status: "draft" }] };
      }
      if (sql.includes("to_regclass('audit.audit_log')")) return { rows: [{ ok: false }] };
      if (sql.includes("samsara.vehicle_state_miles")) {
        return { rows: [{ state: "TX", miles: "1000.000" }] };
      }
      if (sql.includes("fuel.fuel_transactions")) {
        return { rows: [{ state: "TX", gallons: "100.000", source_kind: "relay", record_count: "1" }] };
      }
      return { rows: [] };
    }),
  };
}

describe("quarterly-preparer.service", () => {
  it("computes tax from catalog rates without hardcoding", () => {
    const filing = buildFilingCalculations({
      quarterLabel: "2026-Q2",
      milesByJurisdiction: { TX: 1000, OK: 500 },
      fuelByJurisdiction: { TX: 100, OK: 50 },
    });
    expect(filing.fleet_mpg).toBe(10);
    expect(filing.rates_source).toContain("iftach.org");
    expect(filing.jurisdiction_rows.length).toBeGreaterThan(0);
    const tx = filing.jurisdiction_rows.find((row) => row.state === "TX");
    expect(tx?.tax_rate_per_gallon).toBeGreaterThan(0);
    expect(tx?.tax_owed).toBe(0);
  });
});

describe("reports ifta routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await registerReportsIftaRoutes(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it("prepares a draft filing", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/reports/ifta/prepare?operating_company_id=${companyId}`,
      payload: { quarter: "2026-Q2" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("draft");
  });

  it("enforces owner-only WF-064 confirmation on owner-approve", async () => {
    const { currentAuthUser } = await import("../../shared.js");
    vi.mocked(currentAuthUser).mockReturnValueOnce({
      uuid: "22222222-2222-4222-8222-222222222222",
      role: "Accountant",
    } as any);

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/reports/ifta/draft/${filingUuid}/owner-approve?operating_company_id=${companyId}`,
      payload: {
        wf064_confirm: true,
        confirm_phrase: "APPROVE",
        hold_seconds_elapsed: 5,
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("owner_only");
  });

  it("requires WF-064 confirmation payload for owner approve", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/reports/ifta/draft/${filingUuid}/owner-approve?operating_company_id=${companyId}`,
      payload: { wf064_confirm: false },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("wf064_confirmation_required");
  });

  it("owner-approves with valid WF-064 confirmation", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/reports/ifta/draft/${filingUuid}/owner-approve?operating_company_id=${companyId}`,
      payload: {
        wf064_confirm: true,
        confirm_phrase: "APPROVE",
        hold_seconds_elapsed: 5,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("owner_approved");
  });

  it("lists filing history", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/ifta/filings?operating_company_id=${companyId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().filings).toHaveLength(1);
  });
});
