import { beforeEach, describe, expect, it, vi } from "vitest";

const connect = vi.fn();
const poolQuery = vi.fn();

vi.mock("../../auth/db.js", () => ({
  pool: {
    query: (...args: unknown[]) => poolQuery(...args),
    connect: (...args: unknown[]) => connect(...args),
  },
}));

const deliver = vi.fn();

vi.mock("../handlers/registry.js", () => ({
  buildOutboxHandlerRegistry: () =>
    new Map([
      [
        "fmcsa.customer.verify_requested",
        {
          eventType: "fmcsa.customer.verify_requested",
          canHandle: () => true,
          deliver: (...args: unknown[]) => deliver(...args),
        },
      ],
    ]),
}));

type FakeClient = {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
};

function makeClient(): FakeClient {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK")) return { rows: [] };
      if (sql.includes("UPDATE outbox.events")) return { rows: [] };
      if (sql.includes("audit.append_event")) return { rows: [] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
}

const BASE_EVENT = {
  id: "evt-1",
  event_type: "fmcsa.customer.verify_requested",
  payload: {
    operating_company_id: "00000000-0000-4000-8000-0000000000a1",
    customer_id: "00000000-0000-4000-8000-0000000000c1",
  },
  retry_count: 0,
};

describe("OutboxProcessor FMCSA verify durability behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connect.mockImplementation(async () => makeClient());
  });

  it("records retry + next_retry_at on transient failure (no unhandled rejection)", async () => {
    const { FmcsaRetryableError } = await import("../../lib/fmcsa-http-errors.js");
    deliver.mockRejectedValue(new FmcsaRetryableError("FMCSA timeout", { retryAfterMs: 12_000 }));
    const { OutboxProcessor } = await import("../processor.js");
    const processor = new OutboxProcessor();
    await (processor as unknown as { processEvent: (e: typeof BASE_EVENT) => Promise<void> }).processEvent(BASE_EVENT);

    const resolvedClients = await Promise.all(connect.mock.results.map((r) => r.value));
    const updateSql = resolvedClients
      .flatMap((c) => c.query.mock.calls.map((call: unknown[]) => String(call[0])))
      .join("\n");
    expect(updateSql).toMatch(/retry_count/);
    expect(updateSql).toMatch(/next_retry_at/);
    expect(updateSql).not.toMatch(/failed_at = now\(\)/);
  });

  it("marks failed_at immediately on permanent delivery error and releases dedupe_key", async () => {
    const { PermanentDeliveryError } = await import("../delivery-errors.js");
    deliver.mockRejectedValue(new PermanentDeliveryError("fmcsa_customer_missing_or_cross_tenant"));
    const { OutboxProcessor } = await import("../processor.js");
    const processor = new OutboxProcessor();
    await (processor as unknown as { processEvent: (e: unknown) => Promise<void> }).processEvent(BASE_EVENT);

    const resolvedClients = await Promise.all(connect.mock.results.map((r) => r.value));
    const updates = resolvedClients.flatMap((c) =>
      c.query.mock.calls.filter((call: unknown[]) => String(call[0]).includes("UPDATE outbox.events"))
    );
    const failedUpdate = updates.find((call: unknown[]) => String(call[0]).includes("failed_at = now()"));
    expect(failedUpdate).toBeTruthy();
    expect(String(failedUpdate?.[0])).toMatch(/dedupe_key = NULL/);
  });

  it("releases dedupe_key on successful deliver (lifetime re-enqueue enabled)", async () => {
    deliver.mockResolvedValue({ message: "fmcsa_verify_verified" });
    const { OutboxProcessor } = await import("../processor.js");
    const processor = new OutboxProcessor();
    await (processor as unknown as { processEvent: (e: unknown) => Promise<void> }).processEvent(BASE_EVENT);
    const resolvedClients = await Promise.all(connect.mock.results.map((r) => r.value));
    const delivered = resolvedClients.flatMap((c) =>
      c.query.mock.calls.filter((call: unknown[]) => String(call[0]).includes("delivered_at = now()"))
    );
    expect(delivered.some((call: unknown[]) => String(call[0]).includes("dedupe_key = NULL"))).toBe(true);
  });

  it("marks visible failed_at when max attempts exhausted and releases dedupe_key", async () => {
    deliver.mockRejectedValue(new Error("FMCSA timeout"));
    const { OutboxProcessor } = await import("../processor.js");
    const { OUTBOX_MAX_RETRIES } = await import("../retry-backoff.js");
    const processor = new OutboxProcessor();
    await (processor as unknown as { processEvent: (e: unknown) => Promise<void> }).processEvent({
      ...BASE_EVENT,
      retry_count: OUTBOX_MAX_RETRIES - 1,
    });

    const resolvedClients = await Promise.all(connect.mock.results.map((r) => r.value));
    const updateCalls = resolvedClients.flatMap((c) =>
      c.query.mock.calls.filter((call: unknown[]) => String(call[0]).includes("retry_count = $2"))
    );
    expect(updateCalls.length).toBeGreaterThan(0);
    expect(updateCalls[0]?.[1]?.[2]).toBe(true);
    expect(String(updateCalls[0]?.[0])).toMatch(/dedupe_key = NULL/);
  });

  it("claim SQL is restart-durable (SKIP LOCKED + stale lock reclaim) and remains globally architectural", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const src = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../processor.ts"), "utf8");
    expect(src).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(src).toMatch(/locked_at < now\(\) - interval '5 minutes'/);
    expect(src).toMatch(/OUTBOX_CLAIM_IS_GLOBAL_ARCHITECTURAL/);
    expect(src).toMatch(/payload\.operating_company_id/);
  });
});
