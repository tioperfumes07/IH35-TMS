import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  scheduleMock,
  wrapBackgroundJobTickMock,
  withLuciaBypassMock,
  ingestReeferHoursMock,
  clientQueryMock,
} = vi.hoisted(() => ({
  scheduleMock: vi.fn(),
  wrapBackgroundJobTickMock: vi.fn(),
  withLuciaBypassMock: vi.fn(),
  ingestReeferHoursMock: vi.fn(),
  clientQueryMock: vi.fn(),
}));

vi.mock("node-cron", () => ({ default: { schedule: scheduleMock } }));
vi.mock("../auth/db.js", () => ({ withLuciaBypass: withLuciaBypassMock }));
vi.mock("../lib/background-jobs.js", () => ({ wrapBackgroundJobTick: wrapBackgroundJobTickMock }));
vi.mock("../maintenance/reefer-hours.routes.js", () => ({
  ingestReeferHoursFromSamsaraForCompany: ingestReeferHoursMock,
}));

function makeApp() {
  return { log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } };
}

describe("maintenance.reefer_hours_poll_cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.ENABLE_REEFER_HOURS_POLL_CRON;
    withLuciaBypassMock.mockImplementation(async (fn: (client: unknown) => Promise<void>) => {
      await fn({ query: clientQueryMock });
    });
    wrapBackgroundJobTickMock.mockImplementation(async (_n: string, fn: () => Promise<void>) => {
      await fn();
    });
  });

  it("schedules every 15 minutes in America/Chicago", async () => {
    const { initializeReeferHoursPollCron } = await import("./reefer-hours-poll.cron.js");
    initializeReeferHoursPollCron(makeApp() as never);
    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock.mock.calls[0][0]).toBe("*/15 * * * *");
    expect(scheduleMock.mock.calls[0][2]).toMatchObject({ timezone: "America/Chicago" });
  });

  it("does not schedule when disabled via env", async () => {
    process.env.ENABLE_REEFER_HOURS_POLL_CRON = "false";
    const { initializeReeferHoursPollCron } = await import("./reefer-hours-poll.cron.js");
    initializeReeferHoursPollCron(makeApp() as never);
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it("ingests reefer hours with tenant context for enabled Samsara tenants", async () => {
    const TENANT = "11111111-1111-1111-1111-111111111111";
    clientQueryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM org.companies")) return { rows: [{ operating_company_id: TENANT }] };
      if (sql.includes("SELECT EXISTS")) return { rows: [{ is_enabled: true }] };
      if (sql.includes("set_config('app.operating_company_id'")) {
        expect(values?.[0]).toBe(TENANT);
        return { rows: [] };
      }
      return { rows: [] };
    });
    ingestReeferHoursMock.mockResolvedValue({ ingested: 3, skipped: 1 });

    const { initializeReeferHoursPollCron } = await import("./reefer-hours-poll.cron.js");
    initializeReeferHoursPollCron(makeApp() as never);
    const tick = scheduleMock.mock.calls[0][1] as () => Promise<void>;
    await tick();

    expect(ingestReeferHoursMock).toHaveBeenCalledWith(expect.anything(), TENANT);
  });

  it("skips tenants without Samsara enabled", async () => {
    const TENANT = "22222222-2222-2222-2222-222222222222";
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM org.companies")) return { rows: [{ operating_company_id: TENANT }] };
      if (sql.includes("SELECT EXISTS")) return { rows: [{ is_enabled: false }] };
      return { rows: [] };
    });

    const { initializeReeferHoursPollCron } = await import("./reefer-hours-poll.cron.js");
    initializeReeferHoursPollCron(makeApp() as never);
    const tick = scheduleMock.mock.calls[0][1] as () => Promise<void>;
    await tick();

    expect(ingestReeferHoursMock).not.toHaveBeenCalled();
  });
});
