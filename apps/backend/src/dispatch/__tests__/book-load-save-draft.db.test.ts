/**
 * ROUND 24.3 (owner, 2026-09-14, correcting an earlier wrong instruction of the owner's own):
 * "SAVE DRAFT" EXISTS AND WRITES NOTHING. Measured live: 0 status='draft' loads, 0
 * is_quicksave_draft=true loads across 114 USMCA loads with a Save draft button on every booking.
 * Root cause: the button called `submitLoad(values, "draft")` wrapped in `form.handleSubmit`, the
 * FULL book_dispatch validation gate — a half-finished load always fails it, `onInvalidSubmit`
 * fires, nothing is written.
 *
 * "Integration, not unit mock" (owner's own words) — this is a REAL Postgres round-trip through
 * `bookLoad()` itself, not a frontend/service unit test with a mocked client. Runs only under CI's
 * ephemeral Postgres (see `describeIntegration` below), same convention as every other `.db.test.ts`
 * in this repo.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { bookLoad, type BookLoadInput } from "../book-load.service.js";
import { updateDispatchLoad as updateLoad } from "../update-load.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("Save draft — real Postgres round-trip (ROUND 24.3)", () => {
  let db: pg.Client;
  let companyId: string;
  let customerId: string;

  beforeAll(async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    companyId = await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    // Session-scoped (no LOCAL), matching the established .db.test.ts convention for a client that
    // lives for the whole file (e.g. fuel-load-attribution-coverage.db.test.ts's own comment on this
    // exact trap): `SET LOCAL` is transaction-scoped and vanishes the moment the seeding BEGIN/COMMIT
    // below commits -- every later `db.query()` in this file's own `it()` blocks would then run under
    // FORCED RLS with no bypass, silently returning 0 rows (read as a false pass/false empty, not a
    // real error). Set once here, for the connection's whole lifetime.
    await db.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [companyId]);
    await db.query("BEGIN");
    const trailerEquipmentId = await prepareCompanyForLoadInserts(db, companyId);
    const cust = await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id) VALUES ($1, $2::uuid) RETURNING id`,
      [`ROUND 24.3 draft-save customer ${randomUUID().slice(0, 8)}`, companyId]
    );
    customerId = cust.rows[0]!.id;
    // allocateNextLoadNumber's lazy seed (load-id-reservation.service.ts) refuses to invent a
    // starting number on a company with ZERO prior PURELY-NUMERIC loads (FirstLoadNumberRequiredError
    // -- MAX(load_number::bigint) filters to `load_number ~ '^[0-9]+$'`). This fresh ephemeral
    // integration-test company has none yet -- the shared ensureIntegrationLoadId() helper seeds a
    // NON-numeric "E2E-xxxxx" load specifically so it does NOT interfere with load-number-allocator
    // tests, which means it does not help THIS test either. Seed one directly, with a real numeric
    // load_number, so bookLoad()'s real allocator path has something to seed its MAX() from -- same
    // as it always does on prod (114 real USMCA loads already exist there).
    await db.query(
      `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id)
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::uuid)`,
      [companyId, "90000000", customerId, TEST_OWNER_USER_ID, trailerEquipmentId]
    );
    await db.query("COMMIT");
  }, 30_000);

  afterAll(async () => {
    await db?.end();
  });

  function draftInput(overrides: Partial<BookLoadInput> = {}): BookLoadInput {
    return {
      requestingUserUuid: TEST_OWNER_USER_ID,
      requestingUserRole: "Dispatcher",
      operating_company_id: companyId,
      customer_id: customerId,
      status: "booked",
      charges: [],
      stops: [],
      save_mode: "draft",
      ...overrides,
    };
  }

  it("persists a real row with ONLY operating_company_id + customer_id + a minted load_number — no trip_type, no stops", async () => {
    const result = await bookLoad(draftInput());
    expect(result.kind, `expected ok, got: ${JSON.stringify(result)}`).toBe("ok");
    if (result.kind !== "ok") return;
    const loadId = String(result.row.id);
    expect(String(result.row.load_number ?? "")).toMatch(/^\d+$/);
    expect(result.row.status).toBe("draft");
    expect(result.row.is_quicksave_draft).toBe(true);
    expect(result.row.quicksave_completed_at ?? null).toBeNull();

    // Re-read independently, bypassing whatever the in-memory `result.row` claims.
    const reread = await db.query(
      `SELECT status, is_quicksave_draft, quicksave_completed_at, customer_id, operating_company_id
         FROM mdata.loads WHERE id = $1::uuid`,
      [loadId]
    );
    expect(reread.rows[0]?.status).toBe("draft");
    expect(reread.rows[0]?.is_quicksave_draft).toBe(true);
    expect(reread.rows[0]?.customer_id).toBe(customerId);
  });

  it("a draft mints no invoice, no driver bill, no GL posting", async () => {
    const result = await bookLoad(draftInput());
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const loadId = String(result.row.id);

    const invoices = await db.query(`SELECT id FROM accounting.invoices WHERE source_load_id = $1::uuid`, [loadId]);
    expect(invoices.rows.length, "draft load must mint 0 invoices").toBe(0);

    const bills = await db.query(`SELECT id FROM driver_finance.driver_bills WHERE load_id = $1::uuid`, [loadId]);
    expect(bills.rows.length, "draft load must mint 0 driver bills").toBe(0);

    const postings = await db.query(
      `SELECT id FROM accounting.load_revenue_recognition_postings WHERE load_id = $1::uuid`,
      [loadId]
    );
    expect(postings.rows.length, "draft load must mint 0 revenue-recognition GL postings").toBe(0);
  });

  it("still records the deferred required fields (quicksave_pending_fields.pending_fields), nested — not clobbering the existing hazmat/customer_po_number keys other services read", async () => {
    const result = await bookLoad(draftInput({ quicksave_pending_fields: ["trip_type", "miles_practical"] }));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const row = await db.query<{ quicksave_pending_fields: { hazmat?: boolean; pending_fields?: string[] } }>(
      `SELECT quicksave_pending_fields FROM mdata.loads WHERE id = $1::uuid`,
      [String(result.row.id)]
    );
    const meta = row.rows[0]?.quicksave_pending_fields;
    expect(meta?.pending_fields).toEqual(["trip_type", "miles_practical"]);
    expect(meta).toHaveProperty("hazmat"); // the pre-existing key other backend readers depend on
  });

  it("resuming and finishing the draft (a real PATCH via updateDispatchLoad) stamps is_quicksave_draft=false and quicksave_completed_at", async () => {
    const result = await bookLoad(draftInput());
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const loadId = String(result.row.id);

    await updateLoad(db, {
      loadId,
      operatingCompanyId: companyId,
      requestingUserUuid: TEST_OWNER_USER_ID,
      requestingUserRole: "Dispatcher",
      fields: { notes: "finished from resume" },
    });

    const after = await db.query(
      `SELECT is_quicksave_draft, quicksave_completed_at FROM mdata.loads WHERE id = $1::uuid`,
      [loadId]
    );
    expect(after.rows[0]?.is_quicksave_draft).toBe(false);
    expect(after.rows[0]?.quicksave_completed_at).not.toBeNull();
  });
});
