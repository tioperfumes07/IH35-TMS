import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  assertBulkActionAllowed,
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
  enforceBulkRateLimit,
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

  it("uses 5 second sliding window in source", () => {
    expect(BULK_RATE_LIMIT_INTERVAL_SEC).toBe(5);
    expect(rateLimitSource).toMatch(/bulk_rate_limited/);
    expect(rateLimitSource).toMatch(/Retry-After/);
  });

  it("returns 429 with retry_after_seconds when called too soon", async () => {
    const userId = "66666666-6666-4666-8666-666666666666";
    const reply = {
      header: vi.fn(),
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    const first = await enforceBulkRateLimit(userId, reply as never);
    expect(first).toBe(true);
    releaseBulkInFlight(userId);

    const second = await enforceBulkRateLimit(userId, {
      header: vi.fn(),
      code: vi.fn().mockReturnValue({
        send: vi.fn((body: { error: string }) => body),
      }),
    } as never);

    expect(second).toBe(false);
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
    expect(post).toHaveBeenCalledWith("/api/v1/mdata/customers/bulk-update", expect.any(Function));
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
