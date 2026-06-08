import { describe, expect, it, vi, beforeEach } from "vitest";
import { DateTime } from "luxon";
import { computeNextScheduledAt, Q8_DEFAULT_REPORT_SLUGS } from "../cadence.js";

vi.mock("../../../email/queue.service.js", () => ({
  enqueueEmail: vi.fn(async () => ({ queueId: "queue-test-1" })),
}));

vi.mock("../../../accounting/ar-aging.service.js", () => ({
  getArAgingReport: vi.fn(async () => ({
    rows: [{ customer_name: "Acme", bucket_61_90_cents: 10000, bucket_91_plus_cents: 5000 }],
  })),
}));

vi.mock("../../../accounting/profit-loss.service.js", () => ({
  getProfitLossReport: vi.fn(async () => ({
    lines: [{ label: "Revenue", amount_cents: 100000, depth: 0 }],
  })),
}));

vi.mock("../../../accounting/statement-export-pdf.service.js", () => ({
  renderStatementPdf: vi.fn(async () => Buffer.from("pdf")),
}));

vi.mock("../../../accounting/statement-export-xlsx.service.js", () => ({
  renderStatementXlsx: vi.fn(async () => Buffer.from("xlsx")),
}));

vi.mock("../../queries/cash-ar-daily.js", () => ({
  cashArDailyQuery: vi.fn(async () => ({
    generatedAt: new Date().toISOString(),
    rowCount: 1,
    summary: "cash ok",
    data: {},
  })),
}));

vi.mock("../../queries/driver-settlements-weekly.js", () => ({
  driverSettlementsWeeklyQuery: vi.fn(async () => ({
    generatedAt: new Date().toISOString(),
    rowCount: 2,
    summary: "settlements ok",
    data: {},
  })),
}));

vi.mock("../../queries/ifta-quarterly.js", () => ({
  iftaQuarterlyQuery: vi.fn(async () => ({
    generatedAt: new Date().toISOString(),
    rowCount: 3,
    summary: "ifta ok",
    data: {},
  })),
}));

vi.mock("../../../scheduled-reports/report-file-builder.js", () => ({
  buildScheduledReportFile: vi.fn(async () => ({
    buffer: Buffer.from("pdf"),
    contentType: "application/pdf",
    extension: "pdf",
    summary: "legacy report",
    envelope: { generatedAt: "", rowCount: 1, summary: "", data: {} },
    subject: "Legacy Report",
  })),
}));

vi.mock("../../../auth/db.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../auth/db.js")>();
  return {
    ...actual,
    withLuciaBypass: vi.fn(async (fn: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
      const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      return fn({ query });
    }),
    withCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
      const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      return fn({ query });
    }),
  };
});

import { enqueueEmail } from "../../../email/queue.service.js";
import { deliverSubscription } from "../runner.service.js";
import type { ScheduledSubscription } from "../subscription.service.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";

function baseSub(overrides: Partial<ScheduledSubscription> = {}): ScheduledSubscription {
  return {
    uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    operating_company_id: COMPANY,
    report_slug: "daily-safety-alerts-digest",
    cadence: "daily",
    day_of_week: null,
    day_of_month: null,
    time_of_day: "05:00:00",
    timezone: "America/Chicago",
    recipient_emails: ["owner@example.com"],
    recipient_user_uuids: null,
    is_active: true,
    last_sent_at: null,
    next_scheduled_at: new Date().toISOString(),
    delivery_format: "html",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("GAP-43 scheduled reports cadence", () => {
  it("computes next Monday 7am for weekly cash position", () => {
    const from = DateTime.fromObject(
      { year: 2026, month: 6, day: 4, hour: 10, minute: 0 },
      { zone: "America/Chicago" }
    ).toJSDate();
    const next = computeNextScheduledAt(
      { cadence: "weekly", dayOfWeek: 1, timeOfDay: "07:00", timezone: "America/Chicago" },
      from
    );
    const nextCt = DateTime.fromJSDate(next).setZone("America/Chicago");
    expect(nextCt.weekday).toBe(1);
    expect(nextCt.hour).toBe(7);
    expect(nextCt.minute).toBe(0);
  });

  it("computes next 1st-of-month 6am for monthly P&L", () => {
    const from = DateTime.fromObject(
      { year: 2026, month: 6, day: 15, hour: 12, minute: 0 },
      { zone: "America/Chicago" }
    ).toJSDate();
    const next = computeNextScheduledAt(
      { cadence: "monthly", dayOfMonth: 1, timeOfDay: "06:00", timezone: "America/Chicago" },
      from
    );
    const nextCt = DateTime.fromJSDate(next).setZone("America/Chicago");
    expect(nextCt.day).toBe(1);
    expect(nextCt.hour).toBe(6);
  });

  it("computes quarterly IFTA preview as quarter-end + 7 days", () => {
    const from = DateTime.fromObject(
      { year: 2026, month: 3, day: 1, hour: 12, minute: 0 },
      { zone: "America/Chicago" }
    ).toJSDate();
    const next = computeNextScheduledAt(
      { cadence: "quarterly", timeOfDay: "07:00", timezone: "America/Chicago" },
      from
    );
    const nextCt = DateTime.fromJSDate(next).setZone("America/Chicago");
    expect(nextCt.month).toBe(4);
    expect(nextCt.day).toBe(7);
  });

  it("seeds all six Q8 default report slugs", () => {
    expect(Q8_DEFAULT_REPORT_SLUGS).toHaveLength(6);
    expect(Q8_DEFAULT_REPORT_SLUGS).toContain("weekly-cash-position");
    expect(Q8_DEFAULT_REPORT_SLUGS).toContain("daily-safety-alerts-digest");
  });
});

describe("GAP-43 scheduled reports runner", () => {
  beforeEach(() => {
    vi.mocked(enqueueEmail).mockClear();
  });

  it("dispatches email via enqueueEmail with valid recipients", async () => {
    await deliverSubscription(baseSub());
    expect(enqueueEmail).toHaveBeenCalledTimes(1);
    expect(enqueueEmail.mock.calls[0]?.[0]).toMatchObject({
      operatingCompanyId: COMPANY,
      toAddresses: ["owner@example.com"],
      templateKey: "report-cadence",
    });
  });

  it("logs failed delivery when recipients are empty", async () => {
    await deliverSubscription(baseSub({ recipient_emails: [] }));
    expect(enqueueEmail).not.toHaveBeenCalled();
  });
});

describe("GAP-43 Owner RBAC routes contract", () => {
  it("routes enforce Owner-only mutations", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const routesSrc = fs.readFileSync(
      path.join(process.cwd(), "apps/backend/src/reports/scheduled/routes.ts"),
      "utf8"
    );
    expect(routesSrc).toContain('user.role ?? "") !== "Owner"');
    expect(routesSrc).toContain("requireOwner");
    expect(routesSrc).not.toMatch(/app\.delete\(/);
  });
});

describe("GAP-43 RLS contract", () => {
  it("migration defines tenant-scoped RLS policies", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const sql = fs.readFileSync(
      path.join(process.cwd(), "db/migrations/202606080206_scheduled_report_subscriptions.sql"),
      "utf8"
    );
    expect(sql).toContain("scheduled_subs_tenant_scope");
    expect(sql).toContain("current_setting('app.operating_company_id', true)");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE ON reports.scheduled_subscriptions TO ih35_app");
  });
});
