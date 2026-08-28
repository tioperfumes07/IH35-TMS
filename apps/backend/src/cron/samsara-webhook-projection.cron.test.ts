import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  scheduleMock,
  withLuciaBypassMock,
  wrapBackgroundJobTickMock,
  recordBackgroundJobDisabledMock,
  projectTickMock,
  clientQueryMock,
} = vi.hoisted(() => ({
  scheduleMock: vi.fn(),
  withLuciaBypassMock: vi.fn(),
  wrapBackgroundJobTickMock: vi.fn(),
  recordBackgroundJobDisabledMock: vi.fn(),
  projectTickMock: vi.fn(),
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
  recordBackgroundJobDisabled: recordBackgroundJobDisabledMock,
}));

vi.mock("../integrations/samsara/webhook-projection.service.js", () => ({
  projectSamsaraWebhookEventsForTenant: projectTickMock,
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

describe("samsara webhook projection cron", () => {
  const originalEnableFlag = process.env.ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON;
    withLuciaBypassMock.mockImplementation(async (fn: (client: unknown) => Promise<void>) => {
      await fn({ query: clientQueryMock });
    });
    wrapBackgroundJobTickMock.mockImplementation(async (_jobName: string, fn: () => Promise<void>) => {
      await fn();
    });
    recordBackgroundJobDisabledMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalEnableFlag === undefined) delete process.env.ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON;
    else process.env.ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON = originalEnableFlag;
  });

  // GO-0017-L3-CRON-WRITES-OUTCOME: the disabled-via-env-var early return must record an outcome
  // (not vanish silently) and must NOT schedule a real cron tick.
  it("records a disabled-outcome and does not schedule when ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON=false", async () => {
    process.env.ENABLE_SAMSARA_WEBHOOK_PROJECTION_CRON = "false";
    const { initializeSamsaraWebhookProjectionCron } = await import("./samsara-webhook-projection.cron.js");
    initializeSamsaraWebhookProjectionCron(makeApp() as never);
    expect(scheduleMock).not.toHaveBeenCalled();
    expect(recordBackgroundJobDisabledMock).toHaveBeenCalledWith("samsara.webhook_projection_cron");
  });

  it("throws on empty tenant context from tenant query", async () => {
    const { initializeSamsaraWebhookProjectionCron } = await import("./samsara-webhook-projection.cron.js");
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM org.companies")) return { rows: [{ operating_company_id: "" }] };
      return { rows: [] };
    });
    initializeSamsaraWebhookProjectionCron(makeApp() as never);
    const tick = scheduleMock.mock.calls[0]?.[1] as (() => Promise<void>) | undefined;
    await expect(tick?.()).rejects.toThrow(/empty operating_company_id/i);
  });

  it("runs projection tick for valid tenant", async () => {
    const { initializeSamsaraWebhookProjectionCron } = await import("./samsara-webhook-projection.cron.js");
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM org.companies")) {
        return { rows: [{ operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }] };
      }
      return { rows: [] };
    });
    initializeSamsaraWebhookProjectionCron(makeApp() as never);
    const tick = scheduleMock.mock.calls[0]?.[1] as (() => Promise<void>) | undefined;
    await expect(tick?.()).resolves.toBeUndefined();
    expect(projectTickMock).toHaveBeenCalledWith(expect.any(Object), "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });
});
