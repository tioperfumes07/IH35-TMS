import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { registerInsurancePolicyRoutes } from "./policy.routes.js";
import * as fleet from "./policy-unit-fleet.service.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const POLICY = "22222222-2222-4222-8222-222222222222";
const ASSET = "33333333-3333-4333-8333-333333333333";
const UNIT = "44444444-4444-4444-8444-444444444444";
const MISSING = "99999999-9999-4999-8999-999999999999";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const requireAuthState = { allowed: true };

type ExistingUnit = { isActive: boolean } | null;
const state: {
  policyExists: boolean;
  assetExists: boolean;
  existingUnit: ExistingUnit; // for POST asset lookup
  deleteUnit: { isActive: boolean } | null; // for DELETE id lookup
  activeCount: number;
} = {
  policyExists: true,
  assetExists: true,
  existingUnit: null,
  deleteUnit: { isActive: true },
  activeCount: 1,
};

function unitRow() {
  return {
    id: UNIT,
    policy_id: POLICY,
    asset_id: ASSET,
    insured_value_cents: 500000,
    removed_at: null,
    created_at: "2026-06-07T12:00:00.000Z",
    updated_at: "2026-06-07T12:00:00.000Z",
  };
}

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  if (sql.includes("SET LOCAL app.operating_company_id")) return { rows: [] };
  if (sql.includes("audit.append_event")) return { rows: [] };

  if (sql.includes("FROM insurance.policy") && sql.includes("total_premium_cents::bigint")) {
    if (!state.policyExists || values?.[1] === MISSING) return { rows: [] };
    return {
      rows: [
        {
          id: POLICY,
          total_premium_cents: "1200000",
          effective_date: "2026-01-01",
          expiry_date: "2027-01-01",
        },
      ],
    };
  }

  if (sql.includes("FROM mdata.assets")) {
    if (!state.assetExists || values?.[1] === MISSING) return { rows: [] };
    return { rows: [{ id: ASSET }] };
  }

  if (sql.includes("FROM insurance.policy_unit") && sql.includes("FOR UPDATE")) {
    // POST existing-asset lookup keys on asset_id = $3; DELETE unit lookup keys on id = $3.
    if (sql.includes("asset_id = $3::uuid")) {
      return state.existingUnit
        ? { rows: [{ id: UNIT, is_active: state.existingUnit.isActive }] }
        : { rows: [] };
    }
    return state.deleteUnit
      ? { rows: [{ id: UNIT, asset_id: ASSET, is_active: state.deleteUnit.isActive }] }
      : { rows: [] };
  }

  if (sql.includes("INSERT INTO insurance.policy_unit")) return { rows: [unitRow()] };

  if (sql.includes("UPDATE insurance.policy_unit") && sql.includes("removed_at = now()")) {
    return { rows: [] };
  }
  if (sql.includes("UPDATE insurance.policy_unit")) return { rows: [unitRow()] };

  if (sql.includes("SELECT count(*)")) return { rows: [{ count: state.activeCount }] };

  return { rows: [] };
});

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (_req: unknown, reply: { code: (s: number) => { send: (b: unknown) => void } }) => {
    if (requireAuthState.allowed) return true;
    reply.code(401).send({ error: "unauthorized" });
    return false;
  },
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

vi.mock("./policy-unit-fleet.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./policy-unit-fleet.service.js")>();
  return {
    ...actual,
    recordFleetPremiumJournalEntry: vi.fn(async () => "je-55555555-5555-4555-8555-555555555555"),
  };
});

const recordJe = fleet.recordFleetPremiumJournalEntry as Mock;

describe("Block E — insurance fleet add/remove routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  beforeEach(() => {
    requireAuthState.allowed = true;
    state.policyExists = true;
    state.assetExists = true;
    state.existingUnit = null;
    state.deleteUnit = { isActive: true };
    state.activeCount = 1;
    queryMock.mockClear();
    recordJe.mockClear();
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function buildApp(role = "Owner") {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = { uuid: USER, role };
    });
    await registerInsurancePolicyRoutes(app);
    return app;
  }

  it("adds a new unit and posts a pro-rata premium delta journal entry", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/insurance/policies/${POLICY}/units`,
      payload: { operating_company_id: COMPANY, asset_id: ASSET, insured_value_cents: 500000 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; premium_delta_cents: number; premium_journal_entry_id: string | null };
    expect(body.id).toBe(UNIT);
    expect(body.premium_delta_cents).toBeGreaterThan(0);
    expect(body.premium_journal_entry_id).toBe("je-55555555-5555-4555-8555-555555555555");
    expect(recordJe).toHaveBeenCalledTimes(1);
    expect(recordJe).toHaveBeenCalledWith(expect.objectContaining({ direction: "add" }));
  });

  it("is idempotent: re-adding an already-active asset does NOT post a second premium delta", async () => {
    state.existingUnit = { isActive: true };
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/insurance/policies/${POLICY}/units`,
      payload: { operating_company_id: COMPANY, asset_id: ASSET, insured_value_cents: 500000 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { premium_delta_cents: number };
    expect(body.premium_delta_cents).toBe(0);
    expect(recordJe).not.toHaveBeenCalled();
  });

  it("reactivates a previously-removed asset and posts a fresh premium delta", async () => {
    state.existingUnit = { isActive: false };
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/insurance/policies/${POLICY}/units`,
      payload: { operating_company_id: COMPANY, asset_id: ASSET, insured_value_cents: 500000 },
    });
    expect(res.statusCode).toBe(201);
    expect(recordJe).toHaveBeenCalledTimes(1);
    expect(recordJe).toHaveBeenCalledWith(expect.objectContaining({ direction: "add" }));
  });

  it("returns 404 when adding a unit to a non-existent policy", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/insurance/policies/${MISSING}/units`,
      payload: { operating_company_id: COMPANY, asset_id: ASSET, insured_value_cents: 500000 },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "policy_not_found" });
    expect(recordJe).not.toHaveBeenCalled();
  });

  it("returns 404 when adding an unknown asset", async () => {
    state.assetExists = false;
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/insurance/policies/${POLICY}/units`,
      payload: { operating_company_id: COMPANY, asset_id: ASSET, insured_value_cents: 500000 },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "asset_not_found" });
  });

  it("requires a mutating role (403 for read-only roles)", async () => {
    const app = await buildApp("Dispatcher");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/insurance/policies/${POLICY}/units`,
      payload: { operating_company_id: COMPANY, asset_id: ASSET, insured_value_cents: 500000 },
    });
    expect(res.statusCode).toBe(403);
  });

  it("soft-deletes a unit and posts a pro-rata premium credit journal entry", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/insurance/policies/${POLICY}/units/${UNIT}?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(204);
    expect(recordJe).toHaveBeenCalledTimes(1);
    expect(recordJe).toHaveBeenCalledWith(expect.objectContaining({ direction: "remove" }));
    // verify it was a soft-delete (UPDATE removed_at), never a hard DELETE
    const calls = queryMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((sql) => sql.includes("UPDATE insurance.policy_unit") && sql.includes("removed_at = now()"))).toBe(
      true
    );
    expect(calls.some((sql) => sql.includes("DELETE FROM insurance.policy_unit"))).toBe(false);
  });

  it("returns 204 idempotently and posts no credit when the unit is already removed", async () => {
    state.deleteUnit = { isActive: false };
    const app = await buildApp();
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/insurance/policies/${POLICY}/units/${UNIT}?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(204);
    expect(recordJe).not.toHaveBeenCalled();
  });

  it("returns 404 when removing a unit that does not exist", async () => {
    state.deleteUnit = null;
    const app = await buildApp();
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/insurance/policies/${POLICY}/units/${UNIT}?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "policy_unit_not_found" });
  });
});
