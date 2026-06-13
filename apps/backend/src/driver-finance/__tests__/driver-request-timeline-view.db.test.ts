/**
 * B4 — views.driver_request_timeline elapsed-time correctness (DB integration).
 *
 * Inserts driver_request.* spine events for one request with known timestamps and asserts the
 * view computes the response-time gaps correctly. Runs only where a real Postgres is available
 * (CI, or locally with GITHUB_ACTIONS=true + DATABASE_URL pointing at the verify DB).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("views.driver_request_timeline (B4)", () => {
  const conn = process.env.DATABASE_URL ?? process.env.DATABASE_DIRECT_URL ?? "";
  const client = new pg.Client(buildPgClientConfig(conn));
  const OC = "11111111-1111-4111-8111-111111111111";
  const REQ = randomUUID();
  const ACTOR = "22222222-2222-4222-8222-222222222222";
  const T0 = "2026-05-25T08:00:00Z";

  // requested 08:00, viewed 15:00 (+7h), approved 16:00 (+8h), posted 17:00 (+9h)
  const steps: Array<[string, string, string]> = [
    ["request.requested", T0, "Driver"],
    ["request.viewed", "2026-05-25T15:00:00Z", "Dispatcher"],
    ["request.approved", "2026-05-25T16:00:00Z", "Administrator"],
    ["request.posted", "2026-05-25T17:00:00Z", "Administrator"],
  ];

  beforeAll(async () => {
    await client.connect();
    for (const [eventType, at, role] of steps) {
      await client.query(
        `
          INSERT INTO events.event_log
            (operating_company_id, event_type, actor_type, actor_id, subject_type, subject_id,
             payload, occurred_at, source, source_table, source_reference_id, actor_user_id)
          VALUES ($1::uuid, $2, 'user', $3, 'task', $4,
             $5::jsonb, $6::timestamptz, 'driver_request',
             'driver_finance.cash_advance_requests', $4::uuid, $3::uuid)
        `,
        [OC, eventType, ACTOR, REQ, JSON.stringify({ request_type: "cash_advance", actor_role: role }), at]
      );
    }
  });

  afterAll(async () => {
    await client.query(`DELETE FROM events.event_log WHERE source_reference_id = $1::uuid`, [REQ]).catch(() => {});
    await client.end();
  });

  it("computes the response-time gaps between steps", async () => {
    const res = await client.query(
      `SELECT * FROM views.driver_request_timeline WHERE request_id = $1::uuid`,
      [REQ]
    );
    expect(res.rows.length).toBe(1);
    const row = res.rows[0];
    expect(row.request_type).toBe("cash_advance");
    expect(Number(row.seconds_requested_to_viewed)).toBe(7 * 3600);
    expect(Number(row.seconds_viewed_to_decision)).toBe(1 * 3600);
    expect(Number(row.seconds_requested_to_decision)).toBe(8 * 3600);
    expect(Number(row.seconds_approved_to_posted)).toBe(1 * 3600);
    expect(row.viewed_by_role).toBe("Dispatcher");
    expect(row.approved_by_role).toBe("Administrator");
  });
});
