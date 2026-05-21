import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  scheduleMock,
  wrapBackgroundJobTickMock,
  withLuciaBypassMock,
  runSamsaraHealthCheckForRowMock,
  clientQueryMock,
} = vi.hoisted(() => ({
  scheduleMock: vi.fn(),
  wrapBackgroundJobTickMock: vi.fn(),
  withLuciaBypassMock: vi.fn(),
  runSamsaraHealthCheckForRowMock: vi.fn(),
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

vi.mock("../integrations/samsara/samsara.service.js", () => ({
  runSamsaraHealthCheckForRow: runSamsaraHealthCheckForRowMock,
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

describe("samsara.health_check_cron tenant guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.ENABLE_SAMSARA_HEALTH_CHECK_CRON;

    withLuciaBypassMock.mockImplementation(async (fn: (client: unknown) => Promise<void>) => {
      await fn({ query: clientQueryMock });
    });

    wrapBackgroundJobTickMock.mockImplementation(async (_jobName: string, fn: () => Promise<void>) => {
      await fn();
    });
  });

  it("throws when canonical tenant list contains empty operating_company_id", async () => {
    const { initializeSamsaraHealthCheckCron } = await import("./samsara-health-cron.js");
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM org.companies")) {
        return { rows: [{ operating_company_id: "" }] };
      }
      return { rows: [] };
    });

    initializeSamsaraHealthCheckCron(makeApp() as never);
    const tick = scheduleMock.mock.calls[0]?.[1] as (() => Promise<void>) | undefined;
    await expect(tick?.()).rejects.toThrow(/empty operating_company_id/i);
    expect(clientQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("audit.append_event"),
      expect.arrayContaining(["cron_invalid_tenant_context"])
    );
  });

  it("runs health checks only for enabled tenants", async () => {
    const { initializeSamsaraHealthCheckCron } = await import("./samsara-health-cron.js");
    clientQueryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM org.companies")) {
        return {
          rows: [
            { operating_company_id: "11111111-1111-1111-1111-111111111111" },
            { operating_company_id: "22222222-2222-2222-2222-222222222222" },
          ],
        };
      }
      if (sql.includes("SELECT EXISTS")) {
        return {
          rows: [{ is_enabled: values?.[0] === "11111111-1111-1111-1111-111111111111" }],
        };
      }
      return { rows: [] };
    });

    initializeSamsaraHealthCheckCron(makeApp() as never);
    const tick = scheduleMock.mock.calls[0]?.[1] as (() => Promise<void>) | undefined;
    await expect(tick?.()).resolves.toBeUndefined();

    expect(runSamsaraHealthCheckForRowMock).toHaveBeenCalledTimes(1);
    expect(runSamsaraHealthCheckForRowMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: clientQueryMock }),
      "11111111-1111-1111-1111-111111111111"
    );
    expect(clientQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("audit.append_event"),
      expect.arrayContaining(["cron_skipped_samsara_disabled"])
    );
  });
});
