import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeRequestHash,
  extractResource,
  isIdempotencyRequired,
  pathnameOf,
  registerIdempotencyMiddleware,
  stableStringify,
} from "../idempotency.js";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KEY_A = "11111111-1111-4111-8111-111111111111";
const KEY_B = "22222222-2222-4222-8222-222222222222";
const REQUIRED_URL = "/api/v1/accounting/invoices?operating_company_id=91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const NON_REQUIRED_URL = "/api/v1/loads";

type StoredRow = { request_hash: string; response_status: number; response_body: unknown; expired?: boolean };
type IdempotencyDeps = NonNullable<Parameters<typeof registerIdempotencyMiddleware>[1]>;

function buildDeps() {
  const map = new Map<string, StoredRow>();
  const lookup: IdempotencyDeps["lookup"] = vi.fn(async (key: string) => {
    const row = map.get(key);
    if (!row || row.expired) return null;
    return { request_hash: row.request_hash, response_status: row.response_status, response_body: row.response_body };
  });
  const store: IdempotencyDeps["store"] = vi.fn(async (row) => {
    map.set(row.key, { request_hash: row.requestHash, response_status: row.status, response_body: row.body });
  });
  return { map, deps: { lookup, store } satisfies IdempotencyDeps };
}

describe("idempotency helpers", () => {
  it("identifies required mutating financial endpoints", () => {
    expect(isIdempotencyRequired("POST", "/api/v1/accounting/invoices")).toBe(true);
    expect(isIdempotencyRequired("PATCH", "/api/v1/accounting/invoices/123/void")).toBe(true);
    expect(isIdempotencyRequired("POST", "/api/v1/driver-finance/settlements")).toBe(true);
    expect(isIdempotencyRequired("POST", "/api/v1/banking/transactions/abc/categorize")).toBe(true);
    expect(isIdempotencyRequired("POST", "/api/v1/qbo-sync/vendors/pull-now")).toBe(true);
  });

  it("ignores GETs and non-financial routes", () => {
    expect(isIdempotencyRequired("GET", "/api/v1/accounting/invoices")).toBe(false);
    expect(isIdempotencyRequired("POST", "/api/v1/loads")).toBe(false);
    expect(isIdempotencyRequired("POST", "/api/v1/safety/incidents")).toBe(false);
  });

  it("computes a stable hash regardless of body key order", () => {
    const a = computeRequestHash("POST", "/p", { a: 1, b: { c: 2, d: 3 } });
    const b = computeRequestHash("POST", "/p", { b: { d: 3, c: 2 }, a: 1 });
    expect(a).toBe(b);
  });

  it("computes different hashes for different bodies", () => {
    const a = computeRequestHash("POST", "/p", { amount_cents: 100 });
    const b = computeRequestHash("POST", "/p", { amount_cents: 200 });
    expect(a).not.toBe(b);
  });

  it("stableStringify sorts keys and drops undefined", () => {
    expect(stableStringify({ b: 1, a: undefined, c: 2 })).toBe('{"b":1,"c":2}');
  });

  it("pathnameOf strips the query string", () => {
    expect(pathnameOf("/api/v1/accounting/invoices?x=1")).toBe("/api/v1/accounting/invoices");
    expect(pathnameOf("/api/v1/accounting/invoices")).toBe("/api/v1/accounting/invoices");
  });

  it("extractResource finds nested and top-level ids", () => {
    expect(extractResource("/api/v1/accounting/invoices", { id: "33333333-3333-4333-8333-333333333333" }).resourceId).toBe(
      "33333333-3333-4333-8333-333333333333"
    );
    expect(
      extractResource("/api/v1/accounting/invoices", { invoice: { id: "44444444-4444-4444-8444-444444444444" } })
        .resourceId
    ).toBe("44444444-4444-4444-8444-444444444444");
    expect(extractResource("/api/v1/accounting/invoices", { id: "44444444-4444-4444-8444-444444444444" }).resourceType).toBe(
      "accounting"
    );
  });
});

describe("idempotency middleware (5 behaviors)", () => {
  let app: FastifyInstance;
  let handlerCalls: number;
  let map: Map<string, StoredRow>;

  beforeEach(async () => {
    handlerCalls = 0;
    const built = buildDeps();
    map = built.map;

    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("onRequest", async (req) => {
      (req as { user?: unknown }).user = { uuid: USER_ID, email: null, role: "Owner" };
    });
    await registerIdempotencyMiddleware(app, built.deps);

    app.post("/api/v1/accounting/invoices", async (_req, reply) => {
      handlerCalls += 1;
      return reply.code(201).send({ id: "55555555-5555-4555-8555-555555555555", n: handlerCalls });
    });
    app.post("/api/v1/loads", async (_req, reply) => {
      handlerCalls += 1;
      return reply.code(201).send({ ok: true });
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("behavior 1: missing key on required endpoint → 400", async () => {
    const res = await app.inject({ method: "POST", url: REQUIRED_URL, payload: { customer_id: "x" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("idempotency_key_required");
    expect(handlerCalls).toBe(0);
  });

  it("rejects a non-UUID key → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: REQUIRED_URL,
      headers: { "idempotency-key": "not-a-uuid" },
      payload: { customer_id: "x" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("idempotency_key_invalid");
  });

  it("behavior 2: key present, no prior → process + store", async () => {
    const res = await app.inject({
      method: "POST",
      url: REQUIRED_URL,
      headers: { "idempotency-key": KEY_A },
      payload: { customer_id: "x" },
    });
    expect(res.statusCode).toBe(201);
    expect(handlerCalls).toBe(1);
    expect(map.has(KEY_A)).toBe(true);
  });

  it("behavior 3: replay with matching body → cached response, no re-execution", async () => {
    const first = await app.inject({
      method: "POST",
      url: REQUIRED_URL,
      headers: { "idempotency-key": KEY_A },
      payload: { customer_id: "x" },
    });
    expect(first.statusCode).toBe(201);
    expect(handlerCalls).toBe(1);

    const replay = await app.inject({
      method: "POST",
      url: REQUIRED_URL,
      headers: { "idempotency-key": KEY_A },
      payload: { customer_id: "x" },
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.json().n).toBe(1); // same cached body as first call
    expect(handlerCalls).toBe(1); // handler did NOT run again
  });

  it("behavior 4: same key, different body → 409 Conflict", async () => {
    await app.inject({
      method: "POST",
      url: REQUIRED_URL,
      headers: { "idempotency-key": KEY_B },
      payload: { customer_id: "x" },
    });
    const conflict = await app.inject({
      method: "POST",
      url: REQUIRED_URL,
      headers: { "idempotency-key": KEY_B },
      payload: { customer_id: "DIFFERENT" },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error).toBe("idempotency_key_conflict");
  });

  it("behavior 5: expired (TTL'd) prior is treated as no prior", async () => {
    map.set(KEY_A, { request_hash: "stale", response_status: 201, response_body: { n: 99 }, expired: true });
    const res = await app.inject({
      method: "POST",
      url: REQUIRED_URL,
      headers: { "idempotency-key": KEY_A },
      payload: { customer_id: "x" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().n).toBe(1); // freshly processed, not the stale cached body
    expect(handlerCalls).toBe(1);
  });

  it("non-required endpoints pass through without a key", async () => {
    const res = await app.inject({ method: "POST", url: NON_REQUIRED_URL, payload: {} });
    expect(res.statusCode).toBe(201);
    expect(handlerCalls).toBe(1);
  });
});
