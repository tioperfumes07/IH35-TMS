import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  withCurrentUserMock: vi.fn(),
  requireAuthMock: vi.fn(),
  createWorkOrderFromRoadServiceTicketMock: vi.fn(),
  appendCrudAuditMock: vi.fn(),
}));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: mocked.withCurrentUserMock,
}));

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: mocked.requireAuthMock,
}));

vi.mock("./wo-integration.js", () => ({
  createWorkOrderFromRoadServiceTicket: mocked.createWorkOrderFromRoadServiceTicketMock,
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: mocked.appendCrudAuditMock,
}));

import { registerRoadServiceTicketRoutes } from "./tickets.routes.js";

describe("road service tickets routes (CLOSURE-7)", () => {
  let app: FastifyInstance;
  const companyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  beforeEach(async () => {
    mocked.withCurrentUserMock.mockReset();
    mocked.requireAuthMock.mockReset();
    mocked.createWorkOrderFromRoadServiceTicketMock.mockReset();
    mocked.appendCrudAuditMock.mockReset();
    mocked.requireAuthMock.mockReturnValue(true);
    mocked.withCurrentUserMock.mockImplementation(async (_userId: string, fn: (client: unknown) => Promise<unknown>) =>
      fn({
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (sql.includes("INSERT INTO maintenance.road_service_tickets")) {
            return { rows: [{ id: "ticket-1", status: "open", ticket_number: "RS-1001" }] };
          }
          if (sql.includes("UPDATE maintenance.road_service_tickets") && sql.includes("work_performed")) {
            return { rows: [{ id: "ticket-1", status: "completed", total_cost_cents: 25000 }] };
          }
          if (sql.includes("FROM maintenance.road_service_tickets")) {
            return { rows: [{ id: "ticket-1", status: "open", ticket_number: "RS-1001" }] };
          }
          return { rows: [] };
        }),
      })
    );
    mocked.createWorkOrderFromRoadServiceTicketMock.mockResolvedValue({
      wo_id: "wo-1",
      bill_id: "bill-1",
      already_linked: false,
    });

    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "Owner", email: "owner@ih35.local" };
    });
    await registerRoadServiceTicketRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates open road service ticket", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/road-service-tickets",
      payload: {
        operating_company_id: companyId,
        ticket_number: "RS-1001",
        vendor_name: "FleetNet",
        unit_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        service_type: "tire_change",
        initial_complaint: "Steer tire blowout on I-35",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { ticket: { status: string } };
    expect(body.ticket.status).toBe("open");
  });

  it("completes ticket with cost", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/road-service-tickets/ticket-1/complete",
      payload: {
        operating_company_id: companyId,
        work_performed: "Replaced steer tire",
        total_cost_cents: 25000,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { ticket: { status: string; total_cost_cents: number } };
    expect(body.ticket.status).toBe("completed");
    expect(body.ticket.total_cost_cents).toBe(25000);
  });

  it("create-wo returns wo_id and bill_id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/road-service-tickets/ticket-1/create-wo",
      payload: { operating_company_id: companyId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { wo_id: string; bill_id: string };
    expect(body.wo_id).toBe("wo-1");
    expect(body.bill_id).toBe("bill-1");
    expect(mocked.createWorkOrderFromRoadServiceTicketMock).toHaveBeenCalledOnce();
  });
});
