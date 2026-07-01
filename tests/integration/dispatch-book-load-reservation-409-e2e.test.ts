import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bookLoad } from "../../apps/backend/src/dispatch/book-load.service";
import { buildPgClientConfig } from "../../apps/backend/src/lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../apps/backend/test-helpers/constants";
import { ensureIntegrationPrerequisites } from "../../apps/backend/test-helpers/db-fixture";

// CI GUARD (2026-06-24) — FIX-NEW-409. The wizard's LiveLoadIdBar re-issues reserve-id under load, so by
// submit time the carried reservation_uuid can be expired / consumed / superseded -> claimReservation
// returned null -> the booking 409'd (E_RESERVATION_NOT_AVAILABLE), blocking the load. The user clearly
// intends to book, so the server now transparently allocates a fresh valid load number instead of 409-ing.
// This drives the REAL bookLoad() path with a non-existent reservation_uuid and asserts it returns ok with
// a load number. Old code: kind:"error" status 409 (red); fixed: kind:"ok" (green).
const describeE2E = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeE2E("book-load reservation — E2E (FIX-NEW-409 stale-reservation guard)", () => {
  let client: pg.Client;
  let companyId: string;
  let customerId: string;
  const createdLoadIds: string[] = [];
  // Capture booked load numbers so afterAll can also delete the dispatch.load_id_reservations rows
  // reserveNextLoadId leaves behind. Without this the reservation row survives the suite, and the
  // SECOND run against the same CI DB (backend-vitest → test:coverage) regenerates the same date+seq
  // load number and 23505-collides on (operating_company_id, reserved_load_number).
  const createdLoadNumbers: string[] = [];

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL required for reservation-409 e2e");
    client = new pg.Client(buildPgClientConfig(cs));
    await client.connect();
    await client.query("SET ROLE ih35_app");
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const cust = await client.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id) VALUES ($1, $2::uuid) RETURNING id`,
      [`Reservation409 ${randomUUID().slice(0, 8)}`, companyId]
    );
    customerId = cust.rows[0]!.id;
    await client.query("COMMIT");
  });

  afterAll(async () => {
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");
      for (const id of createdLoadIds) await client.query(`DELETE FROM mdata.loads WHERE id = $1::uuid`, [id]);
      for (const ln of createdLoadNumbers)
        await client.query(
          `DELETE FROM dispatch.load_id_reservations WHERE operating_company_id = $1::uuid AND reserved_load_number = $2`,
          [companyId, ln]
        );
      await client.query(`DELETE FROM mdata.customers WHERE id = $1::uuid`, [customerId]);
      await client.query("COMMIT");
    } catch {
      await client.query("ROLLBACK").catch(() => {});
    } finally {
      await client.end().catch(() => {});
    }
  });

  it("books with a stale/non-existent reservation_uuid → ok (was 409), with a valid load number", async () => {
    const result = await bookLoad({
      requestingUserUuid: TEST_OWNER_USER_ID,
      requestingUserRole: "owner",
      operating_company_id: companyId,
      customer_id: customerId,
      status: "unassigned",
      save_mode: "draft",
      reservation_uuid: randomUUID(), // never reserved -> unclaimable
      charges: [],
      stops: [],
    });

    expect(result.kind, `expected ok, got ${JSON.stringify(result)}`).toBe("ok");
    if (result.kind !== "ok") throw new Error("book failed");
    expect(typeof result.row.load_number).toBe("string");
    expect(String(result.row.load_number).length).toBeGreaterThan(0);
    createdLoadIds.push(String(result.row.id));
    createdLoadNumbers.push(String(result.row.load_number));
  });
});
