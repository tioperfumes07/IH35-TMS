import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

// GO-0045-SCHEDULED-REPORTS-UNSUPPORTED-REPORT-ID-SILENT-NEVER-SENDS: the delivery worker
// (report-file-builder.ts's isLegacyScheduledReportId) can only actually generate 6 legacy report
// ids, but the "Schedule a new report" picker offered the full ~19-entry live report library, a
// disjoint namespace, with no whitelist check on create/PATCH. A schedule created for any of
// those other ids inserted successfully (status='active') and only failed 3 delivery cycles later
// before flipping to 'failed' -- recipients silently never received anything the whole time.
// These tests prove create/PATCH now reject an unsupported report_id with 400, immediately.

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("../accounting/shared.js", () => ({
  currentAuthUser: () => ({ uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Owner" }),
  validationError: (reply: { code: (n: number) => { send: (b: unknown) => unknown } }, error: unknown) =>
    reply.code(400).send({ error: "validation_error", details: error }),
  withCompanyScope: async (_u: string, _c: string, fn: (client: { query: (sql: string) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) =>
    fn({ query: async (sql: string) => (sql.includes("to_regclass") ? { rows: [{ ok: true }] } : { rows: [{ id: "sr-1" }] }) }),
}));

vi.mock("./reporting-audit.js", () => ({
  appendReportingAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./report-delivery.js", () => ({
  deliverScheduledReportToEmail: vi.fn(),
}));

const VALID_BODY = {
  operating_company_id: COMPANY_ID,
  name: "Weekly dispatch",
  frequency: { kind: "weekly" as const, time_local: "07:00", day_of_week: 1 },
  recipients: ["ops@example.com"],
  subject_template: "{report_name}",
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  const { registerScheduledReportsRoutes } = await import("./scheduled-reports.routes.js");
  await app.register(registerScheduledReportsRoutes);
  await app.ready();
  return app;
}

describe("scheduled-reports.routes.ts — report_id whitelist validation (GO-0045)", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
  });

  it("POST rejects an unsupported (non-deliverable) report_id with 400", async () => {
    app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/scheduled-reports",
      payload: { ...VALID_BODY, report_id: "ar-aging" },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("unsupported_report_id");
    expect(body.supported_report_ids).toContain("dispatch-board");
  });

  it("POST accepts a legacy (actually-deliverable) report_id", async () => {
    app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/scheduled-reports",
      payload: { ...VALID_BODY, report_id: "dispatch-board" },
    });
    expect(res.statusCode).not.toBe(400);
  });

  it("PATCH rejects changing report_id to an unsupported value", async () => {
    app = await buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/scheduled-reports/22222222-2222-4222-8222-222222222222",
      payload: { operating_company_id: COMPANY_ID, report_id: "customer-profitability" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("unsupported_report_id");
  });

  it("PATCH with no report_id change is unaffected by the guard", async () => {
    app = await buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/scheduled-reports/22222222-2222-4222-8222-222222222222",
      payload: { operating_company_id: COMPANY_ID, name: "Renamed" },
    });
    expect(res.statusCode).not.toBe(400);
  });
});
