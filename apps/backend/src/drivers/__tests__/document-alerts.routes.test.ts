import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDriversDocumentAlertsRoutes } from "../document-alerts.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const RULE = "22222222-2222-4222-8222-222222222222";
const EVENT = "33333333-3333-4333-8333-333333333333";

const mockEvaluate = vi.fn();
const mockListInbox = vi.fn();
const mockListRules = vi.fn();
const mockUpdateRule = vi.fn();
const mockAck = vi.fn();

vi.mock("../document-alerts.service.js", () => ({
  evaluateDocumentAlertsForTenant: (...args: unknown[]) => mockEvaluate(...args),
  listOpenDocumentAlertEvents: (...args: unknown[]) => mockListInbox(...args),
  listDocumentAlertRules: (...args: unknown[]) => mockListRules(...args),
  updateDocumentAlertRule: (...args: unknown[]) => mockUpdateRule(...args),
  acknowledgeDocumentAlertEvent: (...args: unknown[]) => mockAck(...args),
}));

const { mockWithCurrentUser } = vi.hoisted(() => {
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) =>
    fn({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })) })
  );
  return { mockWithCurrentUser: withCurrentUser };
});

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: mockWithCurrentUser,
}));

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

// Cross-tenant guard: assertCompanyMembership() is covered by a dedicated membership test;
// no-op here so these unit tests exercise route logic with pre-change behavior.
vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));


describe("drivers document alerts routes (A24-9)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockEvaluate.mockReset();
    mockListInbox.mockReset();
    mockListRules.mockReset();
    mockUpdateRule.mockReset();
    mockAck.mockReset();
    mockListInbox.mockResolvedValue([]);
    mockListRules.mockResolvedValue([]);
    mockEvaluate.mockResolvedValue({ rules_scanned: 1, events_upserted: 0, notifications_sent: 0 });
    mockUpdateRule.mockResolvedValue({ id: RULE, document_type: "cdl" });
    mockAck.mockResolvedValue({ id: EVENT });

    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Manager",
        email: "office@ih35.local",
      };
    });
    await registerDriversDocumentAlertsRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET inbox returns pending document alerts", async () => {
    mockListInbox.mockResolvedValue([
      { id: EVENT, driver_name: "Jane Doe", document_type: "cdl", days_until_expiry: 30 },
    ]);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/drivers/document-alerts/inbox?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { pending_count: number; events: unknown[] };
    expect(body.pending_count).toBe(1);
    expect(mockListInbox).toHaveBeenCalled();
  });

  it("GET rules lists document alert rules", async () => {
    mockListRules.mockResolvedValue([{ id: RULE, document_type: "cdl", enabled: true }]);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/drivers/document-alert-rules?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ document_alert_rules: [{ id: RULE }] });
  });

  it("PATCH rule updates thresholds", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/drivers/document-alert-rules/${RULE}?operating_company_id=${COMPANY}`,
      payload: { days_before_expiry: [90, 60, 30, 7, 1], enabled: true },
    });
    expect(res.statusCode).toBe(200);
    expect(mockUpdateRule).toHaveBeenCalled();
  });

  it("POST evaluate runs scheduled evaluator", async () => {
    mockEvaluate.mockResolvedValue({ rules_scanned: 7, events_upserted: 2, notifications_sent: 2 });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/drivers/document-alerts/evaluate?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ events_upserted: 2 });
  });

  it("POST acknowledge marks event acknowledged", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/drivers/document-alerts/${EVENT}/acknowledge?operating_company_id=${COMPANY}`,
      payload: { note: "Renewal scheduled" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockAck).toHaveBeenCalled();
  });
});
