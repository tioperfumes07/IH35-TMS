import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  scheduleMock,
  wrapBackgroundJobTickMock,
  withLuciaBypassMock,
  syncSamsaraVehicleLocationsMock,
  syncSamsaraVehicleStatsMock,
  clientQueryMock,
} = vi.hoisted(() => ({
  scheduleMock: vi.fn(),
  wrapBackgroundJobTickMock: vi.fn(),
  withLuciaBypassMock: vi.fn(),
  syncSamsaraVehicleLocationsMock: vi.fn(),
  syncSamsaraVehicleStatsMock: vi.fn(),
  clientQueryMock: vi.fn(),
}));

vi.mock("node-cron", () => ({
  default: {
    schedule: scheduleMock,
  },
}));

vi.mock("../auth/db.js", () => ({
  withLuciaBypass: withLuciaBypassMock,
}));

vi.mock("../lib/background-jobs.js", () => ({
  wrapBackgroundJobTick: wrapBackgroundJobTickMock,
}));

vi.mock("../integrations/samsara/samsara-positions.service.js", () => ({
  syncSamsaraVehicleLocations: syncSamsaraVehicleLocationsMock,
  syncSamsaraVehicleStats: syncSamsaraVehicleStatsMock,
}));

function makeApp() {
  return {
    log: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  };
}

describe("samsara.positions_cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.ENABLE_SAMSARA_POSITIONS_CRON;

    // Mirror the real withLuciaBypass: it RETURNS fn's result (the cron reads it — tenant list, enabled).
    withLuciaBypassMock.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      return fn({ query: clientQueryMock });
    });

    wrapBackgroundJobTickMock.mockImplementation(async (_jobName: string, fn: () => Promise<void>) => {
      await fn();
    });

    // Default: stats enrichment is a no-op success (each test overrides locations as needed).
    syncSamsaraVehicleStatsMock.mockResolvedValue({
      fetched: 0,
      positions_inserted: 0,
      drivers_paired: 0,
      skipped_no_unit: 0,
      errors: [],
    });
  });

  it("upserts positions with tenant context for enabled Samsara tenants", async () => {
    const { initializeSamsaraPositionsCron } = await import("./samsara-positions-cron.js");
    clientQueryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM org.companies")) {
        return { rows: [{ operating_company_id: "11111111-1111-1111-1111-111111111111" }] };
      }
      if (sql.includes("SELECT EXISTS")) {
        return { rows: [{ is_enabled: true }] };
      }
      if (sql.includes("set_config('app.operating_company_id'")) {
        expect(values?.[0]).toBe("11111111-1111-1111-1111-111111111111");
      }
      return { rows: [] };
    });
    syncSamsaraVehicleLocationsMock.mockResolvedValue({
      fetched: 87,
      inserted: 87,
      skipped_no_unit: 0,
      errors: [],
    });

    initializeSamsaraPositionsCron(makeApp() as never);
    const tick = scheduleMock.mock.calls[0]?.[1] as (() => Promise<void>) | undefined;
    await expect(tick?.()).resolves.toBeUndefined();

    expect(syncSamsaraVehicleLocationsMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: clientQueryMock }),
      "11111111-1111-1111-1111-111111111111"
    );
  });

  it("handles 401 from Samsara gracefully without aborting other tenants", async () => {
    const { initializeSamsaraPositionsCron } = await import("./samsara-positions-cron.js");
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM org.companies")) {
        return {
          rows: [
            { operating_company_id: "11111111-1111-1111-1111-111111111111" },
            { operating_company_id: "22222222-2222-2222-2222-222222222222" },
          ],
        };
      }
      if (sql.includes("SELECT EXISTS")) {
        return { rows: [{ is_enabled: true }] };
      }
      return { rows: [] };
    });
    syncSamsaraVehicleLocationsMock
      .mockResolvedValueOnce({
        fetched: 0,
        inserted: 0,
        skipped_no_unit: 0,
        errors: ["samsara_http_401:http_401"],
      })
      .mockResolvedValueOnce({
        fetched: 10,
        inserted: 10,
        skipped_no_unit: 0,
        errors: [],
      });

    const app = makeApp();
    initializeSamsaraPositionsCron(app as never);
    const tick = scheduleMock.mock.calls[0]?.[1] as (() => Promise<void>) | undefined;
    await expect(tick?.()).resolves.toBeUndefined();

    expect(syncSamsaraVehicleLocationsMock).toHaveBeenCalledTimes(2);
    expect(app.log.warn).toHaveBeenCalled();
    expect(clientQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("audit.append_event"),
      expect.arrayContaining(["cron_samsara_positions_fetch_failed"])
    );
  });
});
