/**
 * FEED-PARITY-02 (Lead, 2026-09-22, live-verified): 18 dispatched USMCA loads carry a real driver
 * bill and $0.00 in dispatch.load_charge_lines — the driver got paid, the customer was never
 * billed. A load may not reach 'dispatched' with no billable charge lines.
 *
 * "Integration, not unit mock" — a REAL Postgres round-trip through `createLoadWithFullSideEffects`
 * itself (the one shared load-create path, PR #22244), not a mocked client. Runs only under CI's
 * ephemeral Postgres, same convention as every other `.db.test.ts` in this repo
 * (book-load-save-draft.db.test.ts is the sibling this file's fixture shape is modeled on).
 *
 * The gate fires AFTER the load row and its charge lines are already written inside the same
 * transaction, so a live_feed refusal can only be proven by a THROW (the only thing that rolls the
 * whole create back — confirmed against withCurrentUser's own implementation, which commits
 * unconditionally on a normal return and only rolls back on a throw).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { createLoadWithFullSideEffects, type BookLoadInput } from "../book-load.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("Zero-dollar charge-lines at dispatch gate (FEED-PARITY-02)", () => {
  let db: pg.Client;
  let companyId: string;
  let customerId: string;
  let driverId: string;

  beforeAll(async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    companyId = await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await db.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [companyId]);
    await db.query("BEGIN");
    await prepareCompanyForLoadInserts(db, companyId);
    const suf = randomUUID().slice(0, 8);
    const cust = await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id) VALUES ($1, $2::uuid) RETURNING id`,
      [`FEED-PARITY-02 customer ${suf}`, companyId]
    );
    customerId = cust.rows[0]!.id;
    // A fully-qualified driver (valid CDL + DOT medical, far in the future, no HOS snapshot row at
    // all -- views.drivers_with_hos_status LEFT JOINs samsara.hos_snapshots, so no row reads as
    // "not in violation", the same shape confirmed live against real USMCA drivers this round) --
    // this test is ONLY about the zero-dollar-charge-lines gate, so every OTHER gate must pass
    // cleanly to prove this one specifically fires (or doesn't) on its own.
    const drv = await db.query<{ id: string }>(
      `
        INSERT INTO mdata.drivers (
          first_name, last_name, phone, email, operating_company_id, status,
          cdl_expires_at, dot_medical_expires_at
        )
        VALUES ($1, $2, $3, $4, $5::uuid, 'Active', '2099-12-31', '2099-12-31')
        RETURNING id
      `,
      ["FeedParity02", `Driver-${suf}`, `+15550002${suf.slice(0, 4)}`, `feed-parity-02-${suf}@test.invalid`, companyId]
    );
    driverId = drv.rows[0]!.id;
    await db.query("COMMIT");
  }, 30_000);

  afterAll(async () => {
    await db?.end();
  });

  function dispatchInput(overrides: Partial<BookLoadInput> = {}): BookLoadInput {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const dayAfter = new Date(Date.now() + 2 * 86_400_000).toISOString();
    return {
      requestingUserUuid: TEST_OWNER_USER_ID,
      requestingUserRole: "Owner",
      operating_company_id: companyId,
      customer_id: customerId,
      status: "assigned_not_dispatched",
      assigned_primary_driver_id: driverId,
      miles_practical: 950,
      charges: [], // <-- the planted defect: no charge lines at all
      stops: [
        { stop_type: "pickup", sequence_number: 1, city: "Laredo", state: "TX", scheduled_arrival_at: tomorrow },
        { stop_type: "delivery", sequence_number: 2, city: "Dallas", state: "TX", scheduled_arrival_at: dayAfter },
      ],
      save_mode: "book_dispatch", // + a crewed driver -> statusForInsert = 'dispatched'
      ...overrides,
    };
  }

  it("live_feed (explicit) REFUSES a dispatch with $0.00 in charge lines — throws, nothing committed", async () => {
    await db.query("BEGIN");
    await db.query("SAVEPOINT gate_check");
    try {
      await expect(
        createLoadWithFullSideEffects(db, dispatchInput(), { source: "live_feed" })
      ).rejects.toThrow(/E_LOAD_DISPATCHED_NO_CHARGE_LINES/);
    } finally {
      await db.query("ROLLBACK TO SAVEPOINT gate_check");
      await db.query("COMMIT");
    }
  });

  it("an undeclared source is fail-closed as live_feed — REFUSES identically", async () => {
    await db.query("BEGIN");
    await db.query("SAVEPOINT gate_check");
    try {
      await expect(
        // @ts-expect-error — deliberately omitting `source` to prove the fail-closed default.
        createLoadWithFullSideEffects(db, dispatchInput(), {})
      ).rejects.toThrow(/E_LOAD_DISPATCHED_NO_CHARGE_LINES/);
    } finally {
      await db.query("ROLLBACK TO SAVEPOINT gate_check");
      await db.query("COMMIT");
    }
  });

  it("historical_backfill EVALUATES + RECORDS the same gate and lets creation proceed — never a silent pass", async () => {
    await db.query("BEGIN");
    await db.query("SAVEPOINT gate_check");
    try {
      const result = await createLoadWithFullSideEffects(db, dispatchInput(), { source: "historical_backfill" });
      expect(result.kind, `expected ok, got: ${JSON.stringify(result)}`).toBe("ok");
      if (result.kind !== "ok") return;
      const loadId = String(result.row.id);
      expect(result.row.status).toBe("dispatched");

      const audit = await db.query<{ event_class: string; severity: string; source: string; payload: Record<string, unknown> }>(
        `
          SELECT event_class, severity, source, payload FROM audit.audit_events
           WHERE payload->>'load_id' = $1
             AND event_class = 'dispatch.historical_backfill_gate_exception'
             AND payload->>'gate' = 'zero_dollar_charge_lines_at_dispatch'
           ORDER BY created_at DESC LIMIT 1
        `,
        [loadId]
      );
      expect(audit.rows.length, "the gate must record an exception row, never silently pass").toBe(1);
      expect(audit.rows[0]?.severity).toBe("warning");
      expect(audit.rows[0]?.source).toBe("FEED-PARITY-ZERO-CHARGE-GATE");
      expect(String(audit.rows[0]?.payload.would_have_blocked_with ?? "")).toMatch(/E_LOAD_DISPATCHED_NO_CHARGE_LINES/);
    } finally {
      await db.query("ROLLBACK TO SAVEPOINT gate_check");
      await db.query("COMMIT");
    }
  });

  it("a load with a real charge line is never refused by THIS gate", async () => {
    await db.query("BEGIN");
    await db.query("SAVEPOINT gate_check");
    try {
      const result = await createLoadWithFullSideEffects(
        db,
        dispatchInput({ charges: [{ code: "linehaul", amount_cents: 200_000 }] }),
        { source: "live_feed" }
      );
      expect(result.kind, `expected ok, got: ${JSON.stringify(result)}`).toBe("ok");
      if (result.kind !== "ok") return;
      expect(result.row.status).toBe("dispatched");
    } finally {
      await db.query("ROLLBACK TO SAVEPOINT gate_check");
      await db.query("COMMIT");
    }
  });
});
