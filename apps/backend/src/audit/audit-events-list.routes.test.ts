import { membershipAware } from "../../test-helpers/membership-aware-query.js";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAuditEventsListQuery, registerAuditEventsListRoutes } from "./audit-events-list.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const BULK_CALL = "33333333-3333-4333-8333-333333333333";

const mockQuery = vi.fn();

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof mockQuery }) => Promise<unknown>) =>
    fn({ query: membershipAware(mockQuery) }),
}));

const mockRequireAuth = vi.fn(() => true);

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

describe("audit events list routes (BULK-6)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockRequireAuth.mockReset();
    mockRequireAuth.mockReturnValue(true);
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: "evt-bulk-1",
          created_at: "2026-06-04T12:00:00.000Z",
          event_type: "mdata.customers.bulk_set_status",
          severity: "info",
          payload: { bulk_call_id: BULK_CALL, operating_company_id: COMPANY },
          actor_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          actor_email: "office@ih35.local",
          source: "BULK-OPS",
          bulk_call_id: BULK_CALL,
          total_count: 1,
        },
      ],
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
    await registerAuditEventsListRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("buildAuditEventsListQuery filters bulk_call_id on payload", () => {
    const built = buildAuditEventsListQuery({
      operating_company_id: COMPANY,
      bulk_call_id: BULK_CALL,
      limit: 50,
      offset: 0,
    });
    expect(built.sql).toContain("payload->>'bulk_call_id'");
    expect(built.values).toContain(BULK_CALL);
  });

  // VEND-F-AUDIT-HISTORY-TAB-ALWAYS-EMPTY — most CRUD writers tag their audit payload
  // resource_type/resource_id (e.g. "mdata.vendors"), not entity_type/entity_id ("vendor"). The
  // entity-detail Audit History tab must match either naming convention.
  describe("entity_type/entity_id OR resource_type/resource_id (mismatched CRUD-writer naming)", () => {
    it("OR-matches the mapped resource_type candidates for a known short entity_type", () => {
      const built = buildAuditEventsListQuery({
        operating_company_id: COMPANY,
        entity_type: "vendor",
        limit: 50,
        offset: 0,
      });
      expect(built.sql).toContain("e.payload->>'entity_type' = $2 OR e.payload->>'resource_type' = ANY($3::text[])");
      expect(built.values).toContain("vendor");
      expect(built.values).toContainEqual(["mdata.vendors"]);
    });

    it("falls back to a bare entity_type match for an entity_type with no known mapping", () => {
      const built = buildAuditEventsListQuery({
        operating_company_id: COMPANY,
        entity_type: "some_future_entity_nobody_mapped_yet",
        limit: 50,
        offset: 0,
      });
      expect(built.sql).toContain("e.payload->>'entity_type' = $2");
      expect(built.sql).not.toContain("resource_type");
    });

    it("OR-matches entity_id against resource_id", () => {
      const ENTITY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
      const built = buildAuditEventsListQuery({
        operating_company_id: COMPANY,
        entity_id: ENTITY_ID,
        limit: 50,
        offset: 0,
      });
      expect(built.sql).toContain("(e.payload->>'entity_id' = $2 OR e.payload->>'resource_id' = $2)");
      expect(built.values).toContain(ENTITY_ID);
    });

    it("maps every EntityAuditHistoryTab caller's entityType (vendor/customer/driver/equipment/unit/work_order/load)", () => {
      // Guards against a new caller being added to a *.tsx page without a matching map entry —
      // if this list and the frontend's actual callers ever drift, the map itself (checked by the
      // static guard below) is where a future finder should add the missing entry.
      for (const entityType of ["vendor", "customer", "driver", "equipment", "unit", "work_order", "load"]) {
        const built = buildAuditEventsListQuery({
          operating_company_id: COMPANY,
          entity_type: entityType,
          limit: 50,
          offset: 0,
        });
        expect(built.sql).toContain("resource_type");
      }
    });
  });

  // AUDIT-ACTOR-FILTER-NULL-COMPANY-EVENTS-INVISIBLE
  describe("base company predicate vs. NULL-company (company-agnostic) events", () => {
    const ACTOR_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    it("stays strict (no widening) when no actor is given", () => {
      const built = buildAuditEventsListQuery({ operating_company_id: COMPANY, limit: 50, offset: 0 });
      expect(built.sql).toContain("(e.payload->>'operating_company_id')::uuid = $1::uuid");
      expect(built.sql).not.toContain("IS NULL AND e.actor_user_uuid");
    });

    it("stays strict (no widening) when actor is a free-text/email search, not a uuid", () => {
      const built = buildAuditEventsListQuery({
        operating_company_id: COMPANY,
        actor: "someone@example.com",
        limit: 50,
        offset: 0,
      });
      expect(built.sql).toContain("(e.payload->>'operating_company_id')::uuid = $1::uuid");
      expect(built.sql).not.toContain("IS NULL AND e.actor_user_uuid");
    });

    it("widens to admit NULL-company rows when actor is an exact uuid — the live repro shape", () => {
      const built = buildAuditEventsListQuery({
        operating_company_id: COMPANY,
        actor: ACTOR_UUID,
        limit: 50,
        offset: 0,
      });
      expect(built.sql).toContain(
        `((e.payload->>'operating_company_id')::uuid = $1::uuid OR ((e.payload->>'operating_company_id') IS NULL AND e.actor_user_uuid::text = $`
      );
      // The widened branch reuses the SAME raw actor param the existing exact-uuid actor-filter
      // branch already pushes — no new value is added to the wire for this widening.
      const rawActorOccurrences = built.values.filter((v) => v === ACTOR_UUID).length;
      expect(rawActorOccurrences).toBe(1);
    });

    it("never widens for a DIFFERENT company's uuid-shaped actor — company scope still holds for that company's own rows", () => {
      // Sanity: widening only ever admits rows with NULL company (never another company's rows) —
      // the strict `= $1::uuid` branch is preserved verbatim as the OR's first arm, so a row with a
      // real, non-matching operating_company_id is still excluded regardless of actor.
      const built = buildAuditEventsListQuery({
        operating_company_id: COMPANY,
        actor: ACTOR_UUID,
        limit: 50,
        offset: 0,
      });
      expect(built.sql).toContain("(e.payload->>'operating_company_id')::uuid = $1::uuid OR");
    });
  });

  // VEND-AUDIT-HISTORY-TAB-FALSE-EMPTY-NULL-COMPANY-PAYLOAD
  describe("base company predicate vs. NULL-company events for entity_type+entity_id callers", () => {
    const VENDOR_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

    it("stays strict (no widening) when only entity_type is given, no entity_id", () => {
      const built = buildAuditEventsListQuery({
        operating_company_id: COMPANY,
        entity_type: "vendor",
        limit: 50,
        offset: 0,
      });
      expect(built.sql).toContain("(e.payload->>'operating_company_id')::uuid = $1::uuid");
      expect(built.sql).not.toContain("(e.payload->>'operating_company_id') IS NULL)");
    });

    it("stays strict (no widening) when only entity_id is given, no entity_type", () => {
      const built = buildAuditEventsListQuery({
        operating_company_id: COMPANY,
        entity_id: VENDOR_ID,
        limit: 50,
        offset: 0,
      });
      expect(built.sql).toContain("(e.payload->>'operating_company_id')::uuid = $1::uuid");
      expect(built.sql).not.toContain("(e.payload->>'operating_company_id') IS NULL)");
    });

    it("widens to admit NULL-company rows when both entity_type AND entity_id are given — the live repro shape (vendor Audit History tab)", () => {
      const built = buildAuditEventsListQuery({
        operating_company_id: COMPANY,
        entity_type: "vendor",
        entity_id: VENDOR_ID,
        limit: 50,
        offset: 0,
      });
      expect(built.sql).toContain(
        "((e.payload->>'operating_company_id')::uuid = $1::uuid OR (e.payload->>'operating_company_id') IS NULL)"
      );
    });

    it("the entity_type/entity_id filters (pushed separately) still re-narrow the widened rows to the exact entity", () => {
      const built = buildAuditEventsListQuery({
        operating_company_id: COMPANY,
        entity_type: "vendor",
        entity_id: VENDOR_ID,
        limit: 50,
        offset: 0,
      });
      // The widening only removes the company predicate's false exclusion; the entity_id equality
      // filter elsewhere in the WHERE clause is untouched and still requires an exact match.
      expect(built.sql).toContain("e.payload->>'entity_id' = $");
    });
  });

  it("returns audit events for company scope", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/audit/events-list?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { events: Array<{ bulk_call_id: string | null }> };
    expect(body.events).toHaveLength(1);
    expect(body.events[0]?.bulk_call_id).toBe(BULK_CALL);
    expect(mockQuery).toHaveBeenCalled();
  });

  it("passes bulk_call_id filter to query builder", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/audit/events-list?operating_company_id=${COMPANY}&bulk_call_id=${BULK_CALL}`,
    });
    expect(res.statusCode).toBe(200);
    const auditSql = String(mockQuery.mock.calls.at(-1)?.[0] ?? "");
    expect(auditSql).toContain("payload->>'bulk_call_id'");
  });

  it("returns 401 when requireAuth fails", async () => {
    mockRequireAuth.mockImplementation((_req, reply) => {
      reply.code(401).send({ error: "unauthorized" });
      return false;
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/audit/events-list?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("forbids unauthorized roles", async () => {
    const forbidden = Fastify({ logger: false });
    forbidden.decorateRequest("user", null);
    forbidden.addHook("preHandler", async (req) => {
      req.user = { uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "Driver", email: "driver@ih35.local" };
    });
    await registerAuditEventsListRoutes(forbidden);
    await forbidden.ready();
    const res = await forbidden.inject({
      method: "GET",
      url: `/api/v1/audit/events-list?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(403);
    await forbidden.close();
  });
});
