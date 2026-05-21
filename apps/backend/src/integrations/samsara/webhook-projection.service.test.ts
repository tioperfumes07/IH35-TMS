import { describe, expect, it, vi } from "vitest";
import { computeNextRetryAt, projectSamsaraWebhookEventsForTenant } from "./webhook-projection.service.js";

type QueryCall = { sql: string; values?: unknown[] };

function createMockClient(events: Array<Record<string, unknown>>, opts?: { throwOnDriverUpsert?: unknown }) {
  const calls: QueryCall[] = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (sql.includes("FROM integrations.samsara_webhook_events")) {
      return { rows: events };
    }
    if (sql.includes("INSERT INTO integrations.samsara_drivers") && opts?.throwOnDriverUpsert) {
      throw opts.throwOnDriverUpsert;
    }
    return { rows: [] };
  });
  return { client: { query }, calls };
}

describe("samsara webhook projection service", () => {
  it("computes linear retry schedule", () => {
    const now = Date.now();
    const next = computeNextRetryAt(3, 5).getTime();
    expect(next).toBeGreaterThanOrEqual(now + 14 * 60_000);
    expect(next).toBeLessThanOrEqual(now + 16 * 60_000);
  });

  it("processes pending driver/vehicle events and marks them processed", async () => {
    const { client, calls } = createMockClient([
      {
        id: "11111111-1111-1111-1111-111111111111",
        operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        event_type: "driver.updated",
        samsara_event_id: "sam-1",
        signature_valid: true,
        payload: { data: { id: "driver-1" } },
        received_at: new Date().toISOString(),
        projection_attempts: 0,
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        event_type: "vehicle.updated",
        samsara_event_id: "sam-2",
        signature_valid: true,
        payload: { data: { id: "vehicle-1" } },
        received_at: new Date().toISOString(),
        projection_attempts: 0,
      },
    ]);
    const result = await projectSamsaraWebhookEventsForTenant(client, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", {
      batchSize: 100,
    });
    expect(result.processed).toBe(2);
    expect(
      calls.some((call) => call.sql.includes("INSERT INTO integrations.samsara_drivers"))
    ).toBe(true);
    expect(
      calls.some((call) => call.sql.includes("INSERT INTO integrations.samsara_vehicles"))
    ).toBe(true);
    expect(
      calls.filter((call) => call.sql.includes("projection_status = $2")).length
    ).toBeGreaterThanOrEqual(2);
  });

  it("dead-letters invalid signatures", async () => {
    const { client, calls } = createMockClient([
      {
        id: "11111111-1111-1111-1111-111111111111",
        operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        event_type: "driver.updated",
        samsara_event_id: "sam-1",
        signature_valid: false,
        payload: { data: { id: "driver-1" } },
        received_at: new Date().toISOString(),
        projection_attempts: 0,
      },
    ]);
    await projectSamsaraWebhookEventsForTenant(client, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", {
      batchSize: 100,
    });
    const deadLetterUpdate = calls.find(
      (call) => call.sql.includes("projection_status = $2") && call.values?.[1] === "dead_lettered"
    );
    expect(deadLetterUpdate).toBeTruthy();
    expect(deadLetterUpdate?.values?.[3]).toBe("signature_invalid");
  });

  it("schedules retry for transient db errors", async () => {
    const { client, calls } = createMockClient(
      [
        {
          id: "11111111-1111-1111-1111-111111111111",
          operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          event_type: "driver.updated",
          samsara_event_id: "sam-1",
          signature_valid: true,
          payload: { data: { id: "driver-1" } },
          received_at: new Date().toISOString(),
          projection_attempts: 1,
        },
      ],
      { throwOnDriverUpsert: { code: "40P01", message: "deadlock detected" } }
    );
    await projectSamsaraWebhookEventsForTenant(client, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", {
      batchSize: 100,
    });
    const retryUpdate = calls.find(
      (call) => call.sql.includes("projection_status = $2") && call.values?.[1] === "pending"
    );
    expect(retryUpdate).toBeTruthy();
    expect(retryUpdate?.values?.[3]).toBe("transient_db_error");
    expect(retryUpdate?.values?.[5]).toBeTruthy();
  });

  it("dead-letters invalid tenant context", async () => {
    const { client, calls } = createMockClient([
      {
        id: "11111111-1111-1111-1111-111111111111",
        operating_company_id: "",
        event_type: "driver.updated",
        samsara_event_id: "sam-1",
        signature_valid: true,
        payload: { data: { id: "driver-1" } },
        received_at: new Date().toISOString(),
        projection_attempts: 0,
      },
    ]);
    await projectSamsaraWebhookEventsForTenant(client, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", {
      batchSize: 100,
    });
    const deadLetterUpdate = calls.find(
      (call) => call.sql.includes("projection_status = $2") && call.values?.[1] === "dead_lettered"
    );
    expect(deadLetterUpdate).toBeTruthy();
    expect(deadLetterUpdate?.values?.[3]).toBe("tenant_context_invalid");
  });
});
