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

  it("schedules next_retry_at no earlier than Retry-After floor (honors provider backoff)", async () => {
    const { FmcsaRetryableError } = await import("../../lib/fmcsa-http-errors.js");
    // Larger than attempt-1 backoff base (30s) so Math.max(backoff, retryAfter) = retryAfter.
    const retryAfterMs = 180_000;
    const before = Date.now();
    deliver.mockRejectedValue(
      new FmcsaRetryableError("FMCSA safer rate limited (429)", { status: 429, retryAfterMs })
    );
    const { OutboxProcessor } = await import("../processor.js");
    const processor = new OutboxProcessor();
    await (processor as unknown as { processEvent: (e: typeof BASE_EVENT) => Promise<void> }).processEvent(BASE_EVENT);

    const resolvedClients = await Promise.all(connect.mock.results.map((r) => r.value));
    const updateCall = resolvedClients
      .flatMap((c) => c.query.mock.calls)
      .find((call: unknown[]) => String(call[0]).includes("next_retry_at") && String(call[0]).includes("retry_count"));
    expect(updateCall).toBeTruthy();
    const nextRetryAtIso = String(updateCall?.[1]?.[3] ?? "");
    const nextRetryAtMs = Date.parse(nextRetryAtIso);
    expect(Number.isFinite(nextRetryAtMs)).toBe(true);
    // Floor: must not schedule earlier than now + Retry-After (1s clock slack).
    expect(nextRetryAtMs).toBeGreaterThanOrEqual(before + retryAfterMs - 1_000);

    const auditPayloads = resolvedClients.flatMap((c) =>
      c.query.mock.calls
        .filter((call: unknown[]) => String(call[0]).includes("audit.append_event"))
        .map((call: unknown[]) => {
          try {
            return JSON.parse(String(call[1]?.[2] ?? "{}")) as Record<string, unknown>;
          } catch {
            return {};
          }
        })
    );
    const retried = auditPayloads.find((p) => p.retry_after_ms != null);
    expect(retried?.retry_after_ms).toBe(retryAfterMs);
    expect(Number(retried?.retry_delay_ms)).toBeGreaterThanOrEqual(retryAfterMs);
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
    expect(src).toMatch(/processClaimedEvent/);
    expect(src).toMatch(/scheduleRetryViaPoolQuery/);
  });

  it("connect failure on first claimed event schedules retry via pool.query and still processes siblings", async () => {
    const batch = [
      { ...BASE_EVENT, id: "evt-a" },
      { ...BASE_EVENT, id: "evt-b" },
      { ...BASE_EVENT, id: "evt-c" },
    ];
    poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("WITH picked AS")) return { rows: batch };
      return { rows: [] };
    });
    let connectN = 0;
    connect.mockImplementation(async () => {
      connectN += 1;
      if (connectN === 1) throw new Error("connect ECONNREFUSED");
      return makeClient();
    });
    deliver.mockResolvedValue({ message: "ok" });

    const { OutboxProcessor } = await import("../processor.js");
    const processor = new OutboxProcessor();
    await (processor as unknown as { pollAndProcessBatch: () => Promise<void> }).pollAndProcessBatch();

    expect(deliver).toHaveBeenCalledTimes(2);
    const deliveredIds = deliver.mock.calls.map((c) => {
      // deliver(payload, ctx) — ctx.eventId
      return (c[1] as { eventId?: string })?.eventId;
    });
    expect(deliveredIds).toEqual(["evt-b", "evt-c"]);
    const scheduleSql = poolQuery.mock.calls.map((c) => String(c[0])).join("\n");
    expect(scheduleSql).toMatch(/retry_count/);
    expect(scheduleSql).toMatch(/locked_at = NULL/);
    const scheduleParams = poolQuery.mock.calls.find((c) => String(c[0]).includes("retry_count = $2"));
    expect(scheduleParams?.[1]?.[0]).toBe("evt-a");
  });

  it("connect failure on middle claimed event does not abandon later siblings (no 5-minute batch abort)", async () => {
    const batch = [
      { ...BASE_EVENT, id: "evt-1" },
      { ...BASE_EVENT, id: "evt-2" },
      { ...BASE_EVENT, id: "evt-3" },
    ];
    poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("WITH picked AS")) return { rows: batch };
      return { rows: [] };
    });
    let connectN = 0;
    connect.mockImplementation(async () => {
      connectN += 1;
      // First event succeeds (connect #1); second event's delivery connect fails (#2).
      if (connectN === 2) throw new Error("connect timeout");
      return makeClient();
    });
    deliver.mockResolvedValue({ message: "ok" });

    const { OutboxProcessor } = await import("../processor.js");
    const processor = new OutboxProcessor();
    await (processor as unknown as { pollAndProcessBatch: () => Promise<void> }).pollAndProcessBatch();

    expect(deliver).toHaveBeenCalledTimes(2);
    const eventIds = deliver.mock.calls.map((c) => (c[1] as { eventId?: string })?.eventId);
    expect(eventIds).toContain("evt-1");
    expect(eventIds).toContain("evt-3");
    expect(eventIds).not.toContain("evt-2");
  });
});
