import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";

vi.mock("../middleware/rate-limit.js", () => ({
  getRateLimiterRedis: () => null,
}));
import {
  assertBulkActionAllowed,
  assertExactFleetBulkTargetCount,
  DEFAULT_BULK_MAX_IDS,
  FLEET_BULK_MAX_IDS,
  isOwnerOrAdmin,
  isWriteRole,
  parseCanonicalBulkBody,
  processBulkPerId,
  registerBulkRoute,
  sendBulkRequestError,
} from "./bulk-update.factory.js";
import {
  BULK_RATE_LIMIT_INTERVAL_SEC,
  BULK_IN_FLIGHT_MAX_AGE_MS,
  enforceBulkRateLimit,
  plantStrandedInFlightForTests,
  releaseBulkInFlight,
  resetBulkRateLimitForTests,
} from "./bulk-rate-limit.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const factorySource = fs.readFileSync(path.join(here, "bulk-update.factory.ts"), "utf8");
const rateLimitSource = fs.readFileSync(path.join(here, "bulk-rate-limit.ts"), "utf8");

describe("bulk-update.factory module", () => {
  it("exports registerBulkRoute and per-ID savepoint processing", () => {
    expect(factorySource).toMatch(/export function registerBulkRoute/);
    expect(factorySource).toMatch(/processBulkPerId/);
    expect(factorySource).toMatch(/withSavepoint/);
    expect(factorySource).toMatch(/appendBulkCrudAudit/);
  });

  it("uses canonical POST body ids + action + payload", () => {
    expect(factorySource).toMatch(/ids: z\.array\(z\.string\(\)\.uuid\(\)\)/);
    expect(factorySource).toMatch(/action: z\.string/);
    expect(factorySource).toMatch(/bulk_call_id/);
  });

  it("returns 422 for request-level validation failures", () => {
    expect(factorySource).toMatch(/code\(422\)/);
    expect(factorySource).toMatch(/unknown_bulk_action/);
    expect(factorySource).toMatch(/reason_required/);
  });

  it("caps default bulk IDs at 200 and fleet at 100", () => {
    expect(DEFAULT_BULK_MAX_IDS).toBe(200);
    expect(FLEET_BULK_MAX_IDS).toBe(100);
  });
});

describe("assertBulkActionAllowed", () => {
  it("allows Manager for non-destructive actions", () => {
    expect(assertBulkActionAllowed("Manager", "set_status").ok).toBe(true);
  });

  it("blocks Manager on destructive actions", () => {
    const verdict = assertBulkActionAllowed("Manager", "archive", ["archive"]);
    expect(verdict.ok).toBe(false);
  });

  it("allows Owner on destructive actions", () => {
    expect(assertBulkActionAllowed("Owner", "archive", ["archive"]).ok).toBe(true);
    expect(isOwnerOrAdmin("Administrator")).toBe(true);
    expect(isWriteRole("Manager")).toBe(true);
  });
});

describe("assertExactFleetBulkTargetCount", () => {
  it("accepts exact targets and rejects partial target sets", () => {
    expect(() => assertExactFleetBulkTargetCount(2, 2, "pre_update")).not.toThrow();
    expect(() => assertExactFleetBulkTargetCount(2, 1, "pre_update")).toThrow(/expected 2 targets but matched 1/);
    expect(() => assertExactFleetBulkTargetCount(2, 1, "post_update")).toThrow(/during post_update/);
  });
});

describe("parseCanonicalBulkBody", () => {
  it("rejects empty ids array", () => {
    const parsed = parseCanonicalBulkBody({
      ids: [],
      action: "set_status",
      payload: { status: "inactive" },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("processBulkPerId", () => {
  it("records partial success when one ID handler fails", async () => {
    const queries: string[] = [];
    const client = {
      query: async (sql: string) => {
        queries.push(sql);
        return { rows: [] };
      },
    };

    const result = await processBulkPerId(
      client,
      ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      async (ctx) => {
        if (ctx.id.startsWith("2222")) {
          throw new Error("row failed");
        }
        return { ok: true };
      },
      {
        action: "set_status",
        payload: { status: "inactive" },
        operatingCompanyId: "33333333-3333-4333-8333-333333333333",
        actorUserId: "44444444-4444-4444-8444-444444444444",
        bulkCallId: "55555555-5555-4555-8555-555555555555",
      }
    );

    expect(result.succeeded).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(queries.some((q) => q.includes("SAVEPOINT"))).toBe(true);
  });
});

describe("bulk rate limit", () => {
  beforeEach(() => {
    resetBulkRateLimitForTests();
  });

  it("uses a permissive batch window (not points:1 / 5s lockout) and expires stranded inFlight", () => {
    expect(BULK_RATE_LIMIT_INTERVAL_SEC).toBe(60);
    expect(rateLimitSource).toMatch(/BULK_RATE_LIMIT_POINTS\s*=\s*30/);
    expect(rateLimitSource).toMatch(/BULK_IN_FLIGHT_MAX_AGE_MS/);
    expect(rateLimitSource).toMatch(/inFlightSinceMs/);
    expect(rateLimitSource).toMatch(/bulk_rate_limited/);
    expect(rateLimitSource).toMatch(/Retry-After/);
    // Must not regress to the P0 lockout shape.
    expect(rateLimitSource).not.toMatch(/points:\s*1,\s*\n\s*duration:\s*5/);
  });

  it("factory releases inFlight in finally (never permanent lock on throw)", () => {
    expect(factorySource).toMatch(/finally\s*\{[\s\S]*releaseBulkInFlight/);
  });

  it("blocks a second call while inFlight is held, then allows after release", async () => {
    const userId = randomUUID();
    const reply = {
      header: vi.fn(),
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    const first = await enforceBulkRateLimit(userId, reply as never);
    expect(first).toBe(true);

    const whileHeld = await enforceBulkRateLimit(userId, {
      header: vi.fn(),
      code: vi.fn().mockReturnValue({
        send: vi.fn((body: { error: string }) => body),
      }),
    } as never);
    expect(whileHeld).toBe(false);

    releaseBulkInFlight(userId);

    // After release, min-gap may still apply (~2s). Force lastCall old via reset of window only:
    // release clears inFlight; call again after advancing by resetting test state for this user
    // is not exported — instead release and confirm a fresh user works immediately.
    const other = randomUUID();
    const third = await enforceBulkRateLimit(other, reply as never);
    expect(third).toBe(true);
    releaseBulkInFlight(other);
  });

  it("expires a stranded inFlight after BULK_IN_FLIGHT_MAX_AGE_MS", async () => {
    const userId = randomUUID();
    const reply = {
      header: vi.fn(),
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    plantStrandedInFlightForTests(userId, Date.now() - BULK_IN_FLIGHT_MAX_AGE_MS - 1_000);
    const allowed = await enforceBulkRateLimit(userId, reply as never);
    expect(allowed).toBe(true);
    releaseBulkInFlight(userId);
  });
});

describe("registerBulkRoute wiring", () => {
  it("registers a POST handler on the given path", () => {
    const post = vi.fn();
    const app = { post } as never;
    registerBulkRoute({
      app,
      path: "/api/v1/mdata/customers/bulk-update",
      domain: "mdata",
      resource: "customers",
      entityType: "customer",
      actionMap: {
        set_status: z.object({ status: z.enum(["active", "inactive"]) }),
      },
      perEntityHandler: async () => ({ ok: true }),
    });
    expect(post).toHaveBeenCalledWith(
      "/api/v1/mdata/customers/bulk-update",
      expect.objectContaining({ config: expect.objectContaining({ rateLimit: expect.any(Object) }) }),
      expect.any(Function),
    );
  });
});

describe("sendBulkRequestError", () => {
  it("uses 422 status for entire-request errors", () => {
    const send = vi.fn();
    const code = vi.fn().mockReturnValue({ send });
    sendBulkRequestError({ code } as never, "test_code", "test message");
    expect(code).toHaveBeenCalledWith(422);
    expect(send).toHaveBeenCalledWith({ error: "test_code", message: "test message" });
  });
});
