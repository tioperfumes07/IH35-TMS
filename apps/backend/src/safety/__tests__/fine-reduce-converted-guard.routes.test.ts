import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyFinesRoutes } from "../fines.routes.js";

/**
 * OWNER RULING 2026-07-23 (Option B): reducing a civil fine that has already been converted to a
 * driver liability is BLOCKED, not cascaded.
 *
 * convertFineToLiability copies fine.amount_cents into driver_finance.driver_liabilities and the two
 * rows are not linked afterwards. Reducing the fine alone left the driver's liability at the ORIGINAL
 * amount, so the driver was deducted the full amount while the fine read "reduced" — a silent
 * overcharge against a real settlement.
 *
 * Industry parity: QuickBooks refuses in-place edits of payment-bearing transactions and requires the
 * dependent record to be unapplied first; NetSuite dims fields on transactions carrying dependents.
 */

const COMPANY = "11111111-1111-4111-8111-111111111111";
const FINE_ID = "66666666-6666-4666-8666-666666666666";
const LIABILITY_ID = "77777777-7777-4777-8777-777777777777";

const { mockQuery, mockWithCurrentUser } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) =>
    fn({ query })
  );
  return { mockQuery: query, mockWithCurrentUser: withCurrentUser };
});

vi.mock("../../auth/db.js", () => ({ withCurrentUser: mockWithCurrentUser }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
vi.mock("../../driver-finance/deductions.service.js", () => ({
  createSettlementDeduction: vi.fn(async () => ({ id: "deduction" })),
}));

/** Shape the pre-check SELECT returns for the fine under test. */
function seedFine(state: { voided_at?: string | null; converted_to_liability_id?: string | null }) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("SELECT id::text, voided_at, converted_to_liability_id::text")) {
      return {
        rows: [
          {
            id: FINE_ID,
            voided_at: state.voided_at ?? null,
            converted_to_liability_id: state.converted_to_liability_id ?? null,
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes("SET amount_cents")) {
      // The UPDATE repeats the predicate, so it only matches a clean fine.
      const clean = !state.voided_at && !state.converted_to_liability_id;
      return clean
        ? { rows: [{ id: FINE_ID, amount_cents: 40000, status: "reduced" }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  });
}

describe("civil fine reduce — converted-liability guard (Option B)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Owner", email: "owner@ih35.local" };
    });
    await registerSafetyFinesRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const reduce = () =>
    app.inject({
      method: "POST",
      url: `/api/v1/safety/fines/${FINE_ID}/reduce?operating_company_id=${COMPANY}`,
      payload: { amount_cents: 40000, reason: "Court reduced to $400" },
    });

  it("BLOCKS reducing a fine already converted to a driver liability", async () => {
    seedFine({ converted_to_liability_id: LIABILITY_ID });
    const res = await reduce();

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error).toBe("fine_already_converted_to_liability");
    // The error must name the remedy and the dependent record, not just refuse.
    expect(body.driver_liability_id).toBe(LIABILITY_ID);
    expect(String(body.message)).toMatch(/reverse the driver liability first/i);

    // Nothing may be written.
    const wrote = mockQuery.mock.calls.some(([sql]) => String(sql).includes("SET amount_cents"));
    expect(wrote).toBe(false);
  });

  it("BLOCKS reducing a voided fine (void-not-delete: voided records are immutable)", async () => {
    seedFine({ voided_at: "2026-07-01T00:00:00Z" });
    const res = await reduce();

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("fine_voided");
    const wrote = mockQuery.mock.calls.some(([sql]) => String(sql).includes("SET amount_cents"));
    expect(wrote).toBe(false);
  });

  it("ALLOWS reducing a clean, unconverted fine", async () => {
    seedFine({});
    const res = await reduce();

    expect(res.statusCode).toBe(200);
    expect(res.json().amount_cents).toBe(40000);
  });

  it("returns 404 when the fine does not exist", async () => {
    mockQuery.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const res = await reduce();
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("fine_not_found");
  });

  it("re-asserts the predicate in the UPDATE so a concurrent convert cannot slip through", async () => {
    // Pre-check sees a clean fine, but the row is converted by the time the UPDATE runs.
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id::text, voided_at, converted_to_liability_id::text")) {
        return { rows: [{ id: FINE_ID, voided_at: null, converted_to_liability_id: null }], rowCount: 1 };
      }
      if (sql.includes("SET amount_cents")) {
        expect(sql).toContain("converted_to_liability_id IS NULL");
        expect(sql).toContain("voided_at IS NULL");
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await reduce();
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("fine_state_changed");
  });
});

describe("civil fine contest/dismiss — voided records are immutable", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Owner", email: "owner@ih35.local" };
    });
    await registerSafetyFinesRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  for (const action of ["contest", "dismiss"] as const) {
    it(`${action} carries a voided_at IS NULL predicate`, async () => {
      let seenSql = "";
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes(`SET status = '${action}ed'`)) seenSql = sql;
        return { rows: [], rowCount: 0 };
      });

      await app.inject({
        method: "POST",
        url: `/api/v1/safety/fines/${FINE_ID}/${action}?operating_company_id=${COMPANY}`,
        payload: { notes: "note" },
      });

      expect(seenSql).toContain("voided_at IS NULL");
    });
  }
});
