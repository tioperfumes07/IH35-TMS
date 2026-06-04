import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDriverAuditEventsRoutes } from "../driver-events.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";

const { mockListDriverAuditEvents } = vi.hoisted(() => ({
  mockListDriverAuditEvents: vi.fn(),
}));

vi.mock("../driver-events.service.js", () => ({
  listDriverAuditEvents: mockListDriverAuditEvents,
}));

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

describe("driver audit events routes (A24-6)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockListDriverAuditEvents.mockReset();
    mockListDriverAuditEvents.mockResolvedValue({
      events: [
        {
          id: "evt-1",
          created_at: "2026-06-04T12:00:00.000Z",
          event_type: "mdata.drivers.updated",
          severity: "info",
          summary: "mdata.drivers.updated: status",
          actor_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          actor_email: "office@ih35.local",
          payload: { changes: { status: { from: "Active", to: "Inactive" } } },
          source: "BT-1-PHASE1-AUDIT",
        },
      ],
      total_count: 1,
      limit: 100,
      offset: 0,
    });
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Manager",
        email: "office@ih35.local",
      };
    });
    await registerDriverAuditEventsRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns driver-scoped audit events", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/audit/events?operating_company_id=${COMPANY}&entity_type=driver&entity_id=${DRIVER}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { events: Array<{ event_type: string }> };
    expect(body.events).toHaveLength(1);
    expect(body.events[0]?.event_type).toBe("mdata.drivers.updated");
    expect(mockListDriverAuditEvents).toHaveBeenCalledWith(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      expect.objectContaining({ driver_id: DRIVER, operating_company_id: COMPANY })
    );
  });

  it("rejects missing entity_type", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/audit/events?operating_company_id=${COMPANY}&entity_id=${DRIVER}`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("forbids unauthorized roles", async () => {
    const forbidden = Fastify({ logger: false });
    forbidden.decorateRequest("user", null);
    forbidden.addHook("preHandler", async (req) => {
      req.user = { uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "Driver", email: "driver@ih35.local" };
    });
    await registerDriverAuditEventsRoutes(forbidden);
    await forbidden.ready();
    const res = await forbidden.inject({
      method: "GET",
      url: `/api/v1/audit/events?operating_company_id=${COMPANY}&entity_type=driver&entity_id=${DRIVER}`,
    });
    expect(res.statusCode).toBe(403);
    await forbidden.close();
  });
});
