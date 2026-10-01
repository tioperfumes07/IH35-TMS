import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerMaintenanceArrivingSoonRoutes } from "../arriving-soon.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock("../../auth/db.js", () => ({ withCurrentUser: vi.fn(async (_id: string, fn: (client: { query: typeof mockQuery }) => unknown) => fn({ query: mockQuery })) }));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: vi.fn(async () => undefined) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));

describe("maintenance arriving-soon route", () => {
  let app: ReturnType<typeof Fastify>;
  beforeEach(async () => {
    mockQuery.mockReset();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => { req.user = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Manager", email: "maint@ih35.local" }; });
    await registerMaintenanceArrivingSoonRoutes(app);
    await app.ready();
  });
  afterEach(async () => app.close());

  it("returns a deterministic page and exact full-filter counts", async () => {
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set_config")) return { rows: [] };
      // E-14 addition: PM due on arrival comes from E-15 (schedules + shared odometer loader).
      if (sql.includes("FROM maintenance.pm_schedules")) return { rows: [] };
      if (sql.includes("to_regclass('telematics.unit_stop_events')")) return { rows: [{ ok: false }] };
      if (sql.includes("FROM telematics.odometer_readings")) return { rows: [] };
      if (sql.includes("FROM dispatch.intransit_issues") && sql.includes("COUNT(*)::int AS total_count")) {
        expect(values).toEqual([COMPANY]);
        return { rows: [{ total_count: 19 }] };
      }
      if (sql.includes("FROM dispatch.intransit_issues")) {
        expect(values).toEqual([COMPANY, 12, 0]);
        expect(sql).toContain("ORDER BY wo.opened_at DESC, ii.id DESC");
        return { rows: [] };
      }
      if (sql.includes("COUNT(*)::int AS total")) {
        expect(values).toEqual([COMPANY, 48]);
        return { rows: [{ total: 326, severe: 12, warning: 44, info: 270, already_arrived: 3, within_24h: 81, within_48h: 190 }] };
      }
      if (sql.includes("FROM maintenance.v_arriving_soon")) {
        expect(values).toEqual([COMPANY, 48, 25, 50]);
        expect(sql).toContain("load_id ASC");
        expect(sql).toContain("unit_id ASC");
        return { rows: [{ load_id: "load-1", unit_id: "unit-1", issues_json: [], severe_count: 0, warning_count: 1, info_count: 0 }] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    });
    const response = await app.inject({ method: "GET", url: `/api/v1/maintenance/arriving-soon?operating_company_id=${COMPANY}&limit=25&offset=50` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ counts: { total: 326, warning: 44 }, cards: [{ load_id: "load-1" }], recent_conversions_total_count: 19, recent_conversions_limit: 12, recent_conversions_offset: 0 });
  });
});

import { pmDueFields, soonestPmDueByUnit } from "../arriving-soon.routes.js";
describe("E-14 addition: PM due on arrival from E-15", () => {
  const row = (over: Record<string, unknown>) => ({ pm_schedule_id: "s", unit_id: "u1", unit_number: "T174", label: "PM-A", interval_kind: "miles", interval_miles: 25000, interval_days: null, last_service_odometer: null, current_odometer: 455164, current_odometer_read_at: null, current_odometer_source: "odometer_readings", current_odometer_note: null, miles_since_service: null, miles_to_due: null, miles_per_day: null, projected_due_date: null, reason: "no baseline PM odometer on file", ...over }) as never;
  it("picks the most urgent dated schedule per unit", () => {
    const m = soonestPmDueByUnit([row({ label: "PM-B", miles_to_due: 9000 }), row({ label: "PM-A", miles_to_due: 1200, last_service_odometer: 430000 }), row({ label: "DOT" })]);
    expect(m.get("u1")?.label).toBe("PM-A");
  });
  it("no baseline: honest nulls with E-15's reason, never a guessed due", () => {
    expect(pmDueFields(row({}))).toMatchObject({ pm_due_label: "PM-A", pm_has_baseline: false, pm_miles_to_due: null, pm_projected_due_date: null, pm_due_reason: "no baseline PM odometer on file", pm_odometer_source: "odometer_readings" });
  });
  it("no schedule at all is said, not blank", () => {
    expect(pmDueFields(null).pm_due_reason).toBe("no active PM schedule for this unit");
  });
});
