import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GO-0022-BANK-P7-W2-FAKE-SUCCESS: three mutations in p7-wave2.routes.ts previously returned
// { ok: true } (and, for two of them, wrote a REAL audit-log entry claiming the mutation happened)
// even when the target row didn't exist or belonged to a different company:
//   - POST /reconciliation-sessions/:id/finalize — a missing session's variance_cents was coerced
//     via `?? 0` into "safe to finalize", so a bogus/foreign id sailed past the variance check, then
//     the UPDATE (also unchecked) matched 0 rows, yet the route still audit-logged
//     "banking.reconciliation_finalized" and returned success.
//   - PATCH /rules/:id and DELETE /rules/:id — no RETURNING/rowCount check at all on the UPDATE.
// These tests prove the fix behaviorally: a real Fastify.inject request against a foreign/missing id
// now gets 404 with no audit write, while the real id still succeeds normally.

const mockQuery = vi.fn();
const auditMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof mockQuery }) => Promise<unknown>) => fn({ query: mockQuery }),
}));

vi.mock("../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../audit/crud-audit.js", () => ({
  appendCrudAudit: (...args: unknown[]) => auditMock(...args),
}));

const mockRequireAuth = vi.fn((req: { user?: unknown }) => {
  req.user = { uuid: "u1000000-0000-4000-8000-000000000001", email: "u1@example.com", role: "Owner" };
  return true;
});
vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...(args as [{ user?: unknown }, unknown])),
}));

import { registerBankingP7Wave2Routes } from "./p7-wave2.routes.js";

const COMPANY_A = "0c000000-0000-4000-8000-00000000000a";
const COMPANY_B = "0c000000-0000-4000-8000-00000000000b";
const SESSION_ID = "5e900000-0000-4000-8000-000000000001";
const RULE_ID = "5e900000-0000-4000-8000-000000000002";

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(registerBankingP7Wave2Routes);
  await app.ready();
  return app;
}

describe("p7-wave2.routes.ts — reconciliation-sessions/:id/finalize no longer fake-succeeds", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    auditMock.mockClear();
    mockQuery.mockImplementation((sql: string, values: unknown[] = []) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("SELECT variance_cents")) {
        // Only the row's OWN real company matches.
        if (values[1] === COMPANY_A) return { rows: [{ variance_cents: "0" }] };
        return { rows: [] };
      }
      if (sql.includes("UPDATE banking.reconciliation_sessions")) {
        if (values[1] === COMPANY_A) return { rows: [{ id: SESSION_ID }] };
        return { rows: [] };
      }
      return { rows: [] };
    });
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("404s (no audit write) when finalizing a session under the WRONG company", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/banking/reconciliation-sessions/${SESSION_ID}/finalize`,
      payload: { operating_company_id: COMPANY_B },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: "reconciliation_session_not_found" });
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("finalizes and audit-logs when the session belongs to the caller's OWN company", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/banking/reconciliation-sessions/${SESSION_ID}/finalize`,
      payload: { operating_company_id: COMPANY_A },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][2]).toBe("banking.reconciliation_finalized");
  });
});

describe("p7-wave2.routes.ts — PATCH /rules/:id no longer fake-succeeds", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    auditMock.mockClear();
    mockQuery.mockImplementation((sql: string, values: unknown[] = []) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("UPDATE accounting.banking_rules") && sql.includes("priority")) {
        if (values[1] === COMPANY_A) return { rows: [{ id: RULE_ID }] };
        return { rows: [] };
      }
      return { rows: [] };
    });
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("404s (no audit write) when updating a rule under the WRONG company", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/banking/rules/${RULE_ID}`,
      payload: { operating_company_id: COMPANY_B, priority: 5 },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: "banking_rule_not_found" });
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("updates and audit-logs when the rule belongs to the caller's OWN company", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/banking/rules/${RULE_ID}`,
      payload: { operating_company_id: COMPANY_A, priority: 5 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(auditMock).toHaveBeenCalledTimes(1);
  });
});

describe("p7-wave2.routes.ts — DELETE /rules/:id no longer fake-succeeds", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    auditMock.mockClear();
    mockQuery.mockImplementation((sql: string, values: unknown[] = []) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.startsWith("UPDATE accounting.banking_rules") && sql.includes("is_active = false")) {
        if (values[1] === COMPANY_A) return { rows: [{ id: RULE_ID }] };
        return { rows: [] };
      }
      return { rows: [] };
    });
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("404s (no audit write) when deactivating a rule under the WRONG company", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/banking/rules/${RULE_ID}?operating_company_id=${COMPANY_B}`,
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: "banking_rule_not_found" });
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("deactivates and audit-logs when the rule belongs to the caller's OWN company", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/banking/rules/${RULE_ID}?operating_company_id=${COMPANY_A}`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(auditMock).toHaveBeenCalledTimes(1);
  });
});
