import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerDriverMessagesRoutes } from "./driver-messages.routes.js";

/**
 * MDATA-F09 — the cross-entity gate on POST /api/v1/mdata/drivers/:id/messages.
 *
 * operating_company_id arrives in the QUERY STRING and is used to SET app.operating_company_id, so
 * without a membership assertion the caller chooses the scope RLS will enforce. This route has no role
 * check at all, and it ends in deliverDriverProfileMessage — a REAL SMS/email to a real person. The
 * property under test is therefore not just "returns 403": it is that a non-member triggers
 * NO tenant scoping, NO row, and above all NO message leaving the system.
 */
const OPCO = "11111111-1111-4111-8111-111111111111";
const OTHER_ENTITY_DRIVER = "22222222-2222-4222-8222-222222222222";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let memberOfCompany = true;
let driverInCompany = true;
let lastScopedOpco: string | null = null;

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  // Probe issued by assertCompanyMembership, before any scoping.
  if (sql.includes("org.user_company_access")) {
    return memberOfCompany ? { rows: [{ ok: 1 }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }
  if (sql.includes("set_config") && sql.includes("app.operating_company_id")) {
    lastScopedOpco = String(values?.[0] ?? "");
    return { rows: [], rowCount: 0 };
  }
  if (sql.includes("FROM mdata.drivers")) {
    // Model the DATABASE, not the intent. An UNSCOPED lookup finds the driver whatever entity it
    // belongs to — that is the defect — so only honour `driverInCompany` when the query actually
    // carries the entity predicate. Keying this off a bare flag instead made the test pass even with
    // `AND d.operating_company_id = $2::uuid` deleted: it was asserting against the mock, not the code.
    const entityScoped = /operating_company_id\s*=\s*\$\d/.test(sql);
    if (!entityScoped) return { rows: [{ id: OTHER_ENTITY_DRIVER }], rowCount: 1 };
    return driverInCompany
      ? { rows: [{ id: OTHER_ENTITY_DRIVER }], rowCount: 1 }
      : { rows: [], rowCount: 0 };
  }
  if (sql.includes("INSERT INTO mdata.driver_profile_messages")) {
    return {
      rows: [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", channel: "sms", urgency: null, created_at: "2026-08-06T00:00:00Z" }],
      rowCount: 1,
    };
  }
  return { rows: [], rowCount: 0 };
});

// vi.mock factories are hoisted above module-scope consts, so the spy must be created inside
// vi.hoisted or the factory closes over a TDZ binding.
const { deliverMock } = vi.hoisted(() => ({
  deliverMock: vi.fn(async () => ({ delivery_status: "sent", delivery_ref: "ref-1" })),
}));

vi.mock("../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));
vi.mock("../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
vi.mock("../drivers/messages.service.js", () => {
  class DriverMessagePersistenceError extends Error {
    constructor(readonly operation: "create" | "delivery_status") {
      super(`driver_message_${operation}_failed`);
    }
  }
  return {
    deliverDriverProfileMessage: deliverMock,
    DriverMessagePersistenceError,
    requireDriverMessageRow: <T>(rows: T[], operation: "create" | "delivery_status") => {
      if (!rows[0]) throw new DriverMessagePersistenceError(operation);
      return rows[0];
    },
  };
});

describe("driver profile messages — cross-entity gate (MDATA-F09)", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    queryMock.mockClear();
    deliverMock.mockClear();
    memberOfCompany = true;
    driverInCompany = true;
    lastScopedOpco = null;
  });

  async function buildApp() {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = { uuid: USER, role: "Owner" };
    });
    await registerDriverMessagesRoutes(app);
    return app;
  }

  function send(app: Awaited<ReturnType<typeof buildApp>>) {
    return app.inject({
      method: "POST",
      url: `/api/v1/mdata/drivers/${OTHER_ENTITY_DRIVER}/messages?operating_company_id=${OPCO}`,
      payload: { message: "test", channel: "sms" },
    });
  }

  it("a member of the company can message a driver in it (201, delivered)", async () => {
    const res = await send(await buildApp());
    expect(res.statusCode).toBe(201);
    expect(deliverMock).toHaveBeenCalledTimes(1);
    expect(lastScopedOpco).toBe(OPCO);
  });

  it("a NON-member is refused, nothing is scoped, and NO message is sent", async () => {
    memberOfCompany = false;
    const res = await send(await buildApp());
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("forbidden_company_membership");
    // The two properties that matter more than the status code:
    expect(lastScopedOpco).toBeNull(); // RLS scope never set to a company we do not belong to
    expect(deliverMock).not.toHaveBeenCalled(); // no real SMS/email left the system
  });

  it("a member cannot message a driver belonging to a DIFFERENT entity (404, nothing sent)", async () => {
    // Membership alone is not enough: the driver id is caller-supplied too, so it is re-resolved
    // inside the asserted scope. A driver in another entity must not be reachable.
    driverInCompany = false;
    const res = await send(await buildApp());
    expect(res.statusCode).toBe(404);
    expect(deliverMock).not.toHaveBeenCalled();
  });
});
