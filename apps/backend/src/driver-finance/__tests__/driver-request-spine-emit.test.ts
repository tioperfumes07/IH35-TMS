import { describe, expect, it, vi } from "vitest";
import { emitDriverRequestSpineEvent, emitDriverRequestViewedOnce } from "../driver-request-spine-emit.js";

// B4: driver-request timeline emit helper. Pure unit test — DB mocked.

function mockClient(viewedExists = false) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM events.event_log")) {
        return { rows: viewedExists ? [{ ok: 1 }] : [] };
      }
      return { rows: [] };
    }),
  };
  return { client, calls };
}

const baseOpts = {
  operating_company_id: "11111111-1111-4111-8111-111111111111",
  request_id: "33333333-3333-4333-8333-333333333333",
  request_type: "cash_advance",
  source_table: "driver_finance.cash_advance_requests",
  actor_type: "user" as const,
  actor_user_id: "22222222-2222-4222-8222-222222222222",
  actor_role: "Administrator",
};

describe("emitDriverRequestSpineEvent (B4)", () => {
  it("sets the event_log RLS scope, then emits the step with the right event_type, actor, role, source linkage", async () => {
    const { client, calls } = mockClient();
    await emitDriverRequestSpineEvent(client, "approved", baseOpts);

    // event_log RLS keys on app.current_operating_company_id — must be set first.
    expect(calls[0].sql).toContain("app.current_operating_company_id");

    const logCall = calls.find((c) => c.sql.includes("events.log_event"));
    expect(logCall).toBeTruthy();
    const p = logCall!.params;
    expect(p[1]).toBe("request.approved"); // event_type (noun 'request' per valid_event_type)
    expect(p[2]).toBe("user"); // actor_type
    expect(p[4]).toBe("task"); // subject_type (allowed enum; driver-request isolated by event_type/source_table)
    expect(p[5]).toBe(baseOpts.request_id); // subject_id
    expect(p[7]).toBe(baseOpts.source_table); // source_table
    expect(p[8]).toBe(baseOpts.request_id); // source_reference_id
    const payload = JSON.parse(String(p[6]));
    expect(payload.actor_role).toBe("Administrator");
    expect(payload.request_type).toBe("cash_advance");
  });

  it("emits a driver-actor 'requested' step with role Driver", async () => {
    const { client, calls } = mockClient();
    await emitDriverRequestSpineEvent(client, "requested", { ...baseOpts, actor_type: "driver", actor_role: "Driver" });
    const logCall = calls.find((c) => c.sql.includes("events.log_event"))!;
    expect(logCall.params[1]).toBe("request.requested");
    expect(logCall.params[2]).toBe("driver");
    expect(JSON.parse(String(logCall.params[6])).actor_role).toBe("Driver");
  });
});

describe("emitDriverRequestViewedOnce (B4 idempotency)", () => {
  it("emits the FIRST time a request is viewed", async () => {
    const { client, calls } = mockClient(false);
    const emitted = await emitDriverRequestViewedOnce(client, baseOpts);
    expect(emitted).toBe(true);
    expect(calls.some((c) => c.sql.includes("events.log_event"))).toBe(true);
  });

  it("does NOT emit again when a prior view already exists (idempotent)", async () => {
    const { client, calls } = mockClient(true);
    const emitted = await emitDriverRequestViewedOnce(client, baseOpts);
    expect(emitted).toBe(false);
    expect(calls.some((c) => c.sql.includes("events.log_event"))).toBe(false);
  });
});
