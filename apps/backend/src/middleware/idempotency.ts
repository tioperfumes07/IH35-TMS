import crypto from "node:crypto";
import * as Sentry from "@sentry/node";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { withLuciaBypass, LUCIA_BYPASS_SENTINEL_COMPANY_ID } from "../auth/db.js";

/**
 * GAP-IDEMP-KEYS (Tier 1 Trust, Block 3).
 *
 * Makes every mutating financial endpoint safe to retry. The client sends an
 * `Idempotency-Key: <uuid>` header; the server stores the key + response and a replay of
 * the same key returns the cached response with no side effects (24h TTL).
 *
 * Five behaviors (per spec):
 *   1. Missing key on a required endpoint → 400.
 *   2. Key present, no prior record → process the request and store the response.
 *   3. Key present, prior record, request body matches → return cached response (no side effects).
 *   4. Key present, prior record, request body differs → 409 Conflict.
 *   5. Prior record past its TTL → treated as no prior (request is processed again).
 *
 * The store is accessed with withLuciaBypass() because the check runs in an app-level hook,
 * outside the route's per-tenant transaction. The idempotency_keys table still carries RLS
 * (defense-in-depth). The middleware is registered only on the production app in index.ts;
 * unit/route/integration test harnesses build their own minimal Fastify apps and are unaffected.
 */

const HEADER = "idempotency-key";
const STORE_FLAG = Symbol("idempotencyStoreContext");
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TTL_INTERVAL = "24 hours";

/**
 * Mutating routes that REQUIRE an Idempotency-Key. Matched against the URL pathname
 * (query string stripped). Covers the spec's required-on-list financial resources:
 * driver-settlements, invoices, bills, expenses, payments, journal-entries,
 * banking-transactions, factoring-advances, and qbo-sync writes.
 */
const REQUIRED_MATCHERS: RegExp[] = [
  /^\/api\/v1\/driver-finance\/settlements(\/|$)/i,
  /^\/api\/v1\/accounting\/invoices(\/|$)/i,
  /^\/api\/v1\/accounting\/bills(\/|$)/i,
  /^\/api\/v1\/accounting\/bill-payments(\/|$)/i,
  /^\/api\/v1\/expenses(\/|$)/i,
  /^\/api\/v1\/accounting\/payments(\/|$)/i,
  /^\/api\/v1\/accounting\/journal-entries(\/|$)/i,
  /^\/api\/v1\/accounting\/factoring-advances(\/|$)/i,
  /^\/api\/v1\/banking\/transactions(\/|$)/i,
  /^\/api\/v1\/banking\/manual-je(\/|$)/i,
  /^\/api\/v1\/qbo-sync\//i,
  // GAP-86 forward-fix: creating/updating an insurance policy can create accounting
  // bills via createBill(); require an Idempotency-Key so retries/double-clicks cannot
  // produce duplicate policies + duplicate vendor bills syncing to QBO.
  /^\/api\/v1\/insurance\/policies(\/|$)/i,
];

type StoreContext = {
  key: string;
  method: string;
  pathname: string;
  requestHash: string;
};

/** Enforcement can be disabled via env in an operational emergency; default is ON (per spec). */
function enforcementEnabled(): boolean {
  return process.env.IDEMPOTENCY_REQUIRED_ENFORCEMENT !== "off";
}

function isSentryConfigured(): boolean {
  return Boolean(process.env.SENTRY_DSN?.trim());
}

export function pathnameOf(url: string): string {
  const q = url.indexOf("?");
  const path = q === -1 ? url : url.slice(0, q);
  return path || "/";
}

export function isIdempotencyRequired(method: string, pathname: string): boolean {
  if (!MUTATING_METHODS.has(method.toUpperCase())) return false;
  return REQUIRED_MATCHERS.some((re) => re.test(pathname));
}

/** Deterministic JSON stringification (object keys sorted) so the request hash is stable. */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/** Hash that distinguishes "same key, same request" (replay) from "same key, different request" (conflict). */
export function computeRequestHash(method: string, url: string, body: unknown): string {
  const canonical = `${method.toUpperCase()}\n${url}\n${stableStringify(body ?? null)}`;
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

function readKey(req: FastifyRequest): string {
  const raw = req.headers[HEADER];
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) return (raw[0] ?? "").trim();
  return "";
}

function operatingCompanyIdOf(req: FastifyRequest): string {
  const fromQuery = (req.query as Record<string, unknown> | undefined)?.operating_company_id;
  const fromBody = (req.body as Record<string, unknown> | undefined)?.operating_company_id;
  const candidate = typeof fromQuery === "string" ? fromQuery : typeof fromBody === "string" ? fromBody : "";
  return UUID_RE.test(candidate) ? candidate : LUCIA_BYPASS_SENTINEL_COMPANY_ID;
}

/** Best-effort extraction of the created/affected resource for forensic audit (both columns nullable). */
export function extractResource(
  pathname: string,
  body: unknown
): { resourceId: string | null; resourceType: string | null } {
  const segments = pathname.split("/").filter(Boolean);
  const apiIdx = segments.findIndex((s) => s === "v1");
  const resourceType = apiIdx >= 0 && segments[apiIdx + 1] ? segments[apiIdx + 1] : segments.at(-1) ?? null;

  let resourceId: string | null = null;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;
    if (typeof obj.id === "string" && UUID_RE.test(obj.id)) {
      resourceId = obj.id;
    } else {
      for (const value of Object.values(obj)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const nestedId = (value as Record<string, unknown>).id;
          if (typeof nestedId === "string" && UUID_RE.test(nestedId)) {
            resourceId = nestedId;
            break;
          }
        }
      }
    }
  }
  return { resourceId, resourceType };
}

type IdempotencyDeps = {
  lookup: (key: string) => Promise<{ request_hash: string; response_status: number; response_body: unknown } | null>;
  store: (row: {
    key: string;
    userId: string;
    operatingCompanyId: string;
    method: string;
    pathname: string;
    requestHash: string;
    status: number;
    body: unknown;
    resourceId: string | null;
    resourceType: string | null;
  }) => Promise<void>;
};

function defaultDeps(): IdempotencyDeps {
  return {
    lookup: async (key) => {
      return withLuciaBypass(async (client) => {
        const res = await client.query<{ request_hash: string; response_status: number; response_body: unknown }>(
          `SELECT request_hash, response_status, response_body
             FROM public.idempotency_keys
            WHERE key = $1 AND ttl_at > now()
            LIMIT 1`,
          [key]
        );
        return res.rows[0] ?? null;
      });
    },
    store: async (row) => {
      await withLuciaBypass(async (client) => {
        await client.query(
          `INSERT INTO public.idempotency_keys
             (key, user_id, operating_company_id, request_method, request_path,
              request_hash, response_status, response_body, resource_id, resource_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
           ON CONFLICT (key) DO UPDATE SET
             user_id = EXCLUDED.user_id,
             operating_company_id = EXCLUDED.operating_company_id,
             request_method = EXCLUDED.request_method,
             request_path = EXCLUDED.request_path,
             request_hash = EXCLUDED.request_hash,
             response_status = EXCLUDED.response_status,
             response_body = EXCLUDED.response_body,
             resource_id = EXCLUDED.resource_id,
             resource_type = EXCLUDED.resource_type,
             created_at = now(),
             ttl_at = now() + interval '${TTL_INTERVAL}'
           WHERE public.idempotency_keys.ttl_at <= now()`,
          [
            row.key,
            row.userId,
            row.operatingCompanyId,
            row.method,
            row.pathname,
            row.requestHash,
            row.status,
            JSON.stringify(row.body ?? null),
            row.resourceId,
            row.resourceType,
          ]
        );
      });
    },
  };
}

/**
 * Registers the idempotency preHandler (enforce/replay/conflict) and onSend (store) hooks.
 * `deps` is injectable for unit tests; production uses the withLuciaBypass-backed store.
 */
export async function registerIdempotencyMiddleware(
  app: FastifyInstance,
  deps: IdempotencyDeps = defaultDeps()
): Promise<void> {
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    const method = req.method.toUpperCase();
    const pathname = pathnameOf(req.raw.url ?? req.url ?? "/");
    if (!isIdempotencyRequired(method, pathname)) return;
    if (!enforcementEnabled()) return;

    const key = readKey(req);
    if (!key) {
      return reply.code(400).send({
        error: "idempotency_key_required",
        message: "This request requires an Idempotency-Key header.",
      });
    }
    if (!UUID_RE.test(key)) {
      return reply.code(400).send({
        error: "idempotency_key_invalid",
        message: "Idempotency-Key must be a valid UUID.",
      });
    }

    const requestHash = computeRequestHash(method, req.raw.url ?? req.url ?? pathname, req.body);

    let prior: Awaited<ReturnType<IdempotencyDeps["lookup"]>>;
    try {
      prior = await deps.lookup(key);
    } catch (error) {
      // Fail closed: never risk double-processing a financial write when the store is unreachable.
      if (isSentryConfigured()) {
        Sentry.captureException(error, { tags: { subsystem: "idempotency", phase: "lookup" } });
      }
      req.log?.error?.({ err: error }, "[idempotency] lookup failed");
      return reply.code(503).send({
        error: "idempotency_unavailable",
        message: "Unable to verify request idempotency. Please retry.",
      });
    }

    if (prior) {
      if (prior.request_hash !== requestHash) {
        return reply.code(409).send({
          error: "idempotency_key_conflict",
          message: "This Idempotency-Key was already used with a different request.",
        });
      }
      void reply.header("idempotency-replayed", "true");
      return reply.code(prior.response_status).send(prior.response_body);
    }

    const ctx: StoreContext = { key, method, pathname, requestHash };
    (req as unknown as Record<symbol, unknown>)[STORE_FLAG] = ctx;
  });

  app.addHook("onSend", async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const ctx = (req as unknown as Record<symbol, unknown>)[STORE_FLAG] as StoreContext | undefined;
    if (!ctx) return payload;

    const status = reply.statusCode;
    if (status < 200 || status >= 300) return payload; // only cache successful responses

    const userId = req.user?.uuid;
    if (!userId || !UUID_RE.test(userId)) return payload; // user_id is NOT NULL; skip if unknown

    let body: unknown;
    if (typeof payload === "string") {
      try {
        body = payload.length > 0 ? JSON.parse(payload) : {};
      } catch {
        body = { raw: payload };
      }
    } else if (Buffer.isBuffer(payload)) {
      return payload; // non-JSON payload; nothing to cache
    } else {
      body = payload ?? {};
    }

    const { resourceId, resourceType } = extractResource(ctx.pathname, body);

    try {
      await deps.store({
        key: ctx.key,
        userId,
        operatingCompanyId: operatingCompanyIdOf(req),
        method: ctx.method,
        pathname: ctx.pathname,
        requestHash: ctx.requestHash,
        status,
        body,
        resourceId,
        resourceType,
      });
    } catch (error) {
      // Non-fatal: the response already succeeded. Log so we can detect store failures.
      if (isSentryConfigured()) {
        Sentry.captureException(error, { tags: { subsystem: "idempotency", phase: "store" } });
      }
      req.log?.error?.({ err: error }, "[idempotency] store failed");
    }

    return payload;
  });

  app.log?.info?.("[idempotency] middleware registered (required-on-list financial endpoints)");
}
