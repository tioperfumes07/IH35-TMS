import { beforeEach, describe, expect, it, vi } from "vitest";

const { scheduleMock, wrapBackgroundJobTickMock, withLuciaBypassMock, clientQueryMock } = vi.hoisted(() => ({
  scheduleMock: vi.fn(),
  wrapBackgroundJobTickMock: vi.fn(),
  withLuciaBypassMock: vi.fn(),
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

function makeApp() {
  return {
    log: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  };
}

describe("qbo.sync_alerts_cron tenant guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.QBO_SYNC_RETRY_ENABLED = "true";

    withLuciaBypassMock.mockImplementation(async (fn: (client: unknown) => Promise<void>) => {
      await fn({ query: clientQueryMock });
    });

    wrapBackgroundJobTickMock.mockImplementation(async (_jobName: string, fn: () => Promise<void>) => {
      await fn();
    });
  });

  it("throws when due row has empty operating_company_id", async () => {
    const { initializeQboSyncAlertsCron } = await import("./sync-alerts-cron.js");
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass('qbo.sync_alerts')")) return { rows: [{ ok: true }] };
      if (sql.includes("FROM qbo.sync_alerts")) {
        return {
          rows: [{ id: "alert-1", operating_company_id: "", retry_count: 0, max_retries: 3 }],
        };
      }
      return { rows: [] };
    });

    initializeQboSyncAlertsCron(makeApp() as never);
    const tick = scheduleMock.mock.calls[0]?.[1] as (() => Promise<void>) | undefined;
    expect(tick).toBeTypeOf("function");

    await expect(tick?.()).rejects.toThrow(/empty operating_company_id/i);
    expect(clientQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("audit.append_event"),
      expect.arrayContaining(["cron_invalid_tenant_context"])
    );
  });

  it("succeeds with valid operating_company_id", async () => {
    const { initializeQboSyncAlertsCron } = await import("./sync-alerts-cron.js");
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass('qbo.sync_alerts')")) return { rows: [{ ok: true }] };
      if (sql.includes("FROM qbo.sync_alerts")) {
        return {
          rows: [
            {
              id: "alert-1",
              operating_company_id: "11111111-1111-1111-1111-111111111111",
              retry_count: 0,
              max_retries: 3,
            },
          ],
        };
      }
      return { rows: [] };
    });

    initializeQboSyncAlertsCron(makeApp() as never);
    const tick = scheduleMock.mock.calls[0]?.[1] as (() => Promise<void>) | undefined;
    await expect(tick?.()).resolves.toBeUndefined();
    expect(clientQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("set_config('app.operating_company_id'"),
      ["11111111-1111-1111-1111-111111111111"]
    );
  });
});
