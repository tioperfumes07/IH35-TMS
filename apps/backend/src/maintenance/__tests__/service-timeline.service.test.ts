import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aggregateServiceTimeline,
  filterServiceTimelineByDateRange,
  mergeServiceTimelineEvents,
  parseServiceTimelineEventTypes,
  registerMaintenanceServiceTimelineRoutes,
  resolveServiceTimelineDetailPath,
  type ServiceTimelineEvent,
} from "../service-timeline.service.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const UNIT = "22222222-2222-4222-8222-222222222222";

const { mockQuery, mockWithCurrentUser } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) =>
    fn({ query })
  );
  return { mockQuery: query, mockWithCurrentUser: withCurrentUser };
});

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: mockWithCurrentUser,
}));

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

describe("service timeline helpers (B31)", () => {
  it("parseServiceTimelineEventTypes defaults to all types", () => {
    expect(parseServiceTimelineEventTypes(undefined)).toEqual([
      "work_order",
      "inspection",
      "pm",
      "fuel",
      "accident",
    ]);
  });

  it("mergeServiceTimelineEvents sorts newest first and applies limit", () => {
    const events: ServiceTimelineEvent[] = [
      {
        id: "a",
        event_type: "work_order",
        occurred_at: "2026-01-01T00:00:00.000Z",
        title: "older",
        subtitle: null,
        status: "open",
        detail_path: "/maintenance/work-orders/a",
      },
      {
        id: "b",
        event_type: "fuel",
        occurred_at: "2026-06-01T00:00:00.000Z",
        title: "newer",
        subtitle: null,
        status: null,
        detail_path: "/fuel/planner?transaction_id=b",
      },
    ];
    const merged = mergeServiceTimelineEvents(events, 1);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("b");
  });

  it("resolveServiceTimelineDetailPath links PM events to work orders when present", () => {
    expect(resolveServiceTimelineDetailPath("pm", "log-1", "wo-99")).toBe("/maintenance/work-orders/wo-99");
    expect(resolveServiceTimelineDetailPath("pm", "log-1", null)).toBe("/maintenance/pm-auto-engine");
  });

  it("filterServiceTimelineByDateRange respects from/to bounds", () => {
    const events: ServiceTimelineEvent[] = [
      {
        id: "1",
        event_type: "inspection",
        occurred_at: "2026-05-15T12:00:00.000Z",
        title: "mid",
        subtitle: null,
        status: "completed",
        detail_path: "/maintenance/inspections?inspection_id=1",
      },
    ];
    expect(filterServiceTimelineByDateRange(events, "2026-05-01", "2026-05-31")).toHaveLength(1);
    expect(filterServiceTimelineByDateRange(events, "2026-06-01", "2026-06-30")).toHaveLength(0);
  });
});

describe("aggregateServiceTimeline (B31)", () => {
  it("returns work orders for trailer equipment_id scope", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
      if (sql.includes("FROM maintenance.work_orders")) {
        return {
          rows: [
            {
              id: "wo-1",
              display_id: "WO-100",
              wo_type: "repair",
              status: "open",
              description: "Brake service",
              opened_at: "2026-06-02T10:00:00.000Z",
              updated_at: "2026-06-02T10:00:00.000Z",
            },
          ],
        };
      }
      return { rows: [] };
    });
    const events = await aggregateServiceTimeline(
      { query },
      {
        operating_company_id: COMPANY,
        equipment_id: "33333333-3333-4333-8333-333333333333",
        event_types: ["work_order"],
      }
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.event_type).toBe("work_order");
  });
});

describe("service timeline routes (B31)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
      if (sql.includes("FROM maintenance.work_orders")) {
        return {
          rows: [
            {
              id: "wo-1",
              display_id: "WO-200",
              wo_type: "pm",
              status: "complete",
              description: null,
              opened_at: "2026-06-03T08:00:00.000Z",
              updated_at: "2026-06-03T08:00:00.000Z",
            },
          ],
        };
      }
      return { rows: [] };
    });
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Manager",
        email: "maint@ih35.local",
      };
    });
    await registerMaintenanceServiceTimelineRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/v1/maintenance/service-timeline returns merged events for unit", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/service-timeline?operating_company_id=${COMPANY}&unit_id=${UNIT}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { events: ServiceTimelineEvent[] };
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.events[0]?.detail_path).toContain("/maintenance/work-orders/");
  });

  it("GET /api/v1/maintenance/service-timeline rejects missing scope ids", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/service-timeline?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(400);
  });
});
