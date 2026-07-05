import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// H4-4 (Security): the office email/password login must NOT leak account/role existence.
// Every failure mode {not-found, deactivated, no-password, wrong-password, driver-role}
// must return an IDENTICAL 401 body, and the branches that previously skipped the argon2
// verify (not-found, no-password) must still pay the argon2 cost against a dummy hash so
// response timing does not reveal whether an account exists.

const { verifyMock, hashMock, queryMock, createSessionMock, DUMMY_HASH } = vi.hoisted(() => {
  const dummy = "office-dummy-hash-sentinel";
  return {
    DUMMY_HASH: dummy,
    verifyMock: vi.fn(async () => false),
    hashMock: vi.fn(async () => dummy),
    queryMock: vi.fn(async () => ({ rows: [] })),
    createSessionMock: vi.fn(async () => ({ id: "session-1" })),
  };
});

vi.mock("oslo/password", () => ({
  Argon2id: class {
    hash = hashMock;
    verify = verifyMock;
  },
}));

vi.mock("../db.js", () => ({
  withLuciaBypass: async (fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

vi.mock("../lucia.js", () => ({
  lucia: {
    createSessionCookie: () => ({ name: "auth_session", value: "cookie", attributes: {} }),
  },
}));

vi.mock("../session-create.js", () => ({
  createSessionWithLastLogin: createSessionMock,
}));

vi.mock("../session-cookie-policy.js", () => ({
  setLuciaSessionCookie: () => {},
}));

vi.mock("../../middleware/rate-limit.js", () => ({
  enforceOfficePasswordLoginLimits: async () => true,
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: async () => {},
}));

import { registerOfficeLoginRoutes } from "../office-login.routes.js";

type UserRow = {
  id: string;
  role: string;
  email: string | null;
  password_hash: string | null;
  deactivated_at: string | null;
} | null;

let userRow: UserRow = null;

const apps: Array<{ close: () => Promise<void> }> = [];

beforeEach(() => {
  userRow = null;
  verifyMock.mockReset();
  verifyMock.mockResolvedValue(false);
  queryMock.mockReset();
  queryMock.mockImplementation(async (sql: string) => {
    if (/identity\.users/i.test(sql)) return { rows: userRow ? [userRow] : [] };
    return { rows: [] };
  });
});

afterEach(async () => {
  for (const a of apps.splice(0)) await a.close();
  vi.clearAllMocks();
});

async function build() {
  const app = Fastify();
  apps.push(app);
  await registerOfficeLoginRoutes(app as never);
  return app;
}

async function login(body: unknown) {
  const app = await build();
  return app.inject({ method: "POST", url: "/api/v1/auth/office/email-login", payload: body });
}

const GOOD = { email: "user@ih35.com", password: "correct-horse" };

function activeOfficeUser(overrides: Partial<NonNullable<UserRow>> = {}): NonNullable<UserRow> {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    role: "Dispatcher",
    email: "user@ih35.com",
    password_hash: "$argon2id$real$hash",
    deactivated_at: null,
    ...overrides,
  };
}

describe("H4-4 — office-login uniform 401 + constant-time (kill account/role enumeration)", () => {
  it("not-found → uniform 401 AND still performs an argon2 verify (constant time)", async () => {
    userRow = null;
    const res = await login(GOOD);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "invalid_credentials" });
    // Timing oracle killed: verify runs even though no user exists...
    expect(verifyMock).toHaveBeenCalledTimes(1);
    // ...against the constant dummy hash, not a real one.
    expect(verifyMock.mock.calls[0][0]).toBe(DUMMY_HASH);
  });

  it("no-password → uniform 401 AND still verifies against the dummy hash", async () => {
    userRow = activeOfficeUser({ password_hash: null });
    const res = await login(GOOD);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "invalid_credentials" });
    expect(verifyMock).toHaveBeenCalledTimes(1);
    expect(verifyMock.mock.calls[0][0]).toBe(DUMMY_HASH);
  });

  it("deactivated → uniform 401 (no distinct 'deactivated' oracle)", async () => {
    userRow = activeOfficeUser({ deactivated_at: "2026-01-01T00:00:00Z" });
    verifyMock.mockResolvedValue(true); // even if the password is right, deactivated fails uniformly
    const res = await login(GOOD);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "invalid_credentials" });
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });

  it("driver-role → uniform 401, NOT a distinct 403 use_driver_portal (role oracle killed)", async () => {
    userRow = activeOfficeUser({ role: "Driver" });
    verifyMock.mockResolvedValue(true);
    const res = await login(GOOD);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "invalid_credentials" });
    expect(res.body).not.toMatch(/use_driver_portal|driver app/i);
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });

  it("wrong-password → uniform 401", async () => {
    userRow = activeOfficeUser();
    verifyMock.mockResolvedValue(false);
    const res = await login(GOOD);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "invalid_credentials" });
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });

  it("ALL failure modes are byte-identical (status + body)", async () => {
    const results: Array<{ status: number; body: string }> = [];

    userRow = null;
    let res = await login(GOOD);
    results.push({ status: res.statusCode, body: res.body });

    userRow = activeOfficeUser({ password_hash: null });
    res = await login(GOOD);
    results.push({ status: res.statusCode, body: res.body });

    userRow = activeOfficeUser({ deactivated_at: "2026-01-01T00:00:00Z" });
    res = await login(GOOD);
    results.push({ status: res.statusCode, body: res.body });

    userRow = activeOfficeUser({ role: "Driver" });
    res = await login(GOOD);
    results.push({ status: res.statusCode, body: res.body });

    userRow = activeOfficeUser();
    verifyMock.mockResolvedValue(false);
    res = await login(GOOD);
    results.push({ status: res.statusCode, body: res.body });

    const first = JSON.stringify(results[0]);
    for (const r of results) expect(JSON.stringify(r)).toBe(first);
  });

  it("valid active office user + correct password → 200 (success path unchanged)", async () => {
    userRow = activeOfficeUser();
    verifyMock.mockResolvedValue(true);
    const res = await login(GOOD);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, user: { role: "Dispatcher" } });
    expect(verifyMock.mock.calls[0][0]).toBe("$argon2id$real$hash"); // verified against REAL hash
  });

  it("invalid body still 400 (validation precedes the uniform failure path)", async () => {
    const res = await login({ email: "not-an-email", password: "" });
    expect(res.statusCode).toBe(400);
  });
});
