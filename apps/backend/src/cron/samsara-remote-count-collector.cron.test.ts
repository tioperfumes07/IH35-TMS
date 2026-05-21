import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  scheduleMock,
  withLuciaBypassMock,
  wrapBackgroundJobTickMock,
  collectSamsaraRemoteCountsMock,
  clientQueryMock,
} = vi.hoisted(() => ({
  scheduleMock: vi.fn(),
  withLuciaBypassMock: vi.fn(),
  wrapBackgroundJobTickMock: vi.fn(),
  collectSamsaraRemoteCountsMock: vi.fn(),
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

vi.mock("../integrations/samsara/remote-count-collector.js", () => ({
  collectSamsaraRemoteCounts: collectSamsaraRemoteCountsMock,
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

describe("samsara.remote_count_collector cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.SAMSARA_REMOTE_COUNT_COLLECTOR_ENABLED;
    withLuciaBypassMock.mockImplementation(async (fn: (client: unknown) => Promise<void>) => {
      await fn({ query: clientQueryMock });
    });
    wrapBackgroundJobTickMock.mockImplementation(async (_jobName: string, fn: () => Promise<void>) => {
      await fn();
    });
    collectSamsaraRemoteCountsMock.mockResolvedValue({
      operating_company_id: "11111111-1111-1111-1111-111111111111",
      collection_run_id: "22222222-2222-2222-2222-222222222222",
      collected_count: 2,
      failed_entities: [],
      auth_failed: false,
    });
  });

  it("throws when tenant context is empty", async () => {
    const { initializeSamsaraRemoteCountCollectorCron } = await import("./samsara-remote-count-collector.cron.js");
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM org.companies")) return { rows: [{ operating_company_id: "" }] };
      return { rows: [] };
    });
    initializeSamsaraRemoteCountCollectorCron(makeApp() as never);
    const tick = scheduleMock.mock.calls[0]?.[1] as (() => Promise<void>) | undefined;
    await expect(tick?.()).rejects.toThrow(/empty operating_company_id/i);
  });

  it("runs collector for enabled tenants and skips disabled tenants", async () => {
    const { initializeSamsaraRemoteCountCollectorCron } = await import("./samsara-remote-count-collector.cron.js");
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

    initializeSamsaraRemoteCountCollectorCron(makeApp() as never);
    const tick = scheduleMock.mock.calls[0]?.[1] as (() => Promise<void>) | undefined;
    await expect(tick?.()).resolves.toBeUndefined();

    expect(collectSamsaraRemoteCountsMock).toHaveBeenCalledTimes(1);
    expect(collectSamsaraRemoteCountsMock).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      expect.objectContaining({ collectionRunId: expect.any(String) })
    );
    expect(clientQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("audit.append_event"),
      expect.arrayContaining(["cron_skipped_samsara_disabled"])
    );
  });
});
