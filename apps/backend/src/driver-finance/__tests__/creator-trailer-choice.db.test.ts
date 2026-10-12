/**
 * LEAD 443.109 (owner, 2026-10-12): the Settlement Creator never books a load without its trailer — the signed
 * document decides, through the same recorded choice Book / Edit Load use (dispatch/load-trailer-choice.ts).
 * Proven on a real Postgres round-trip (CI ephemeral DB), on an isolated company, everything rolled back:
 *  - picked fleet trailer             -> company choice
 *  - printed number of a fleet trailer -> company choice (case-insensitive, active, owned or leased)
 *  - printed number not in the fleet  -> customer / shipper trailer choice (443.90), incl. another company's trailer
 *  - explicit "no trailer"            -> none
 *  - nothing                          -> null: preview refuses trailer_required for loads it would BOOK (never for a
 *                                        load that already exists), and the seed refuses before anything is booked
 *  - the company choice recorded on a load -> its assignment trailer (load-trailer-choice.db.test.ts proves the expense)
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { applyTrailerChoice, resolveTrailerChoice } from "../../dispatch/load-trailer-choice.js";
import { CREATOR_TRAILER_REQUIRED_MESSAGE, creatorTrailerChoice } from "../creator-trailer-choice.js";
import { creatorPreflightRefusals } from "../settlement-creator-preflight.js";
import { ensureDispatchedLoadsForCreator, SettlementCreatorSeedError } from "../settlement-creator-seed-loads.js";
import type { SettlementCreatorDraft } from "../settlement-creator.types.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("Settlement Creator records the load trailer at birth from the document (LEAD 443.109)", () => {
  let db: pg.Client;
  let companyId: string;
  let otherCompanyId: string;
  let ownTrailerId: string;
  let ownTrailerNumber: string;
  let foreignTrailerNumber: string;
  let existingLoadNumber: string;
  let customerId: string;
  let trailerTypeId: string;
  const suf = randomUUID().slice(0, 8);

  beforeAll(async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    companyId = await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await db.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [companyId]);
    await db.query(`SELECT set_config('app.current_user_id', $1::text, false)`, [TEST_OWNER_USER_ID]);
    await db.query("BEGIN");
    trailerTypeId = await prepareCompanyForLoadInserts(db, companyId);
    customerId = (await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id) VALUES ($1, $2::uuid) RETURNING id::text AS id`,
      [`443.109 customer ${suf}`, companyId],
    )).rows[0]!.id;
    otherCompanyId = (await db.query<{ id: string }>(
      `INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
      [`T109${suf.slice(0, 4)}`.toUpperCase(), `443.109 other ${suf}`],
    )).rows[0]!.id;
    const equipment = async (n: string, owner: string) =>
      (await db.query<{ id: string }>(
        `INSERT INTO mdata.equipment (equipment_number, equipment_type, owner_company_id, is_sample_data) VALUES ($1, 'Reefer', $2::uuid, true) RETURNING id::text AS id`,
        [n, owner],
      )).rows[0]!.id;
    ownTrailerNumber = `T109-${suf}-OWN`;
    foreignTrailerNumber = `T109-${suf}-FOREIGN`;
    ownTrailerId = await equipment(ownTrailerNumber, companyId);
    await equipment(foreignTrailerNumber, otherCompanyId);
    existingLoadNumber = `9109${suf.replace(/\D/g, "").padEnd(4, "0").slice(0, 4)}`;
    await db.query(
      `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, is_sample_data)
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, true)`,
      [companyId, existingLoadNumber, customerId, TEST_OWNER_USER_ID, trailerTypeId],
    );
    await db.query("COMMIT");
  }, 30_000);

  afterAll(async () => {
    await db?.end();
  });

  function draft(overrides: Partial<SettlementCreatorDraft> = {}): SettlementCreatorDraft {
    return {
      operating_company_id: companyId,
      settlement_no: "",
      driver_id: randomUUID(),
      period_start: "2026-10-01",
      period_end: "2026-10-07",
      loads: [{ load_number: `NEW-${suf}` } as SettlementCreatorDraft["loads"][number]],
      fuel_purchases: [],
      ...overrides,
    } as SettlementCreatorDraft;
  }

  it("the document decides the trailer: picked fleet / printed fleet / printed non-fleet / explicit none / nothing", async () => {
    expect(await creatorTrailerChoice(db as never, draft({ trailer_id: ownTrailerId }))).toEqual({ kind: "company", equipment_id: ownTrailerId });
    expect(await creatorTrailerChoice(db as never, draft({ trailer_equipment_number: ` ${ownTrailerNumber.toLowerCase()} ` }))).toEqual({ kind: "company", equipment_id: ownTrailerId });
    expect(await creatorTrailerChoice(db as never, draft({ trailer_equipment_number: "CUST-53-001" }))).toEqual({ kind: "customer", trailer_number: "CUST-53-001" });
    // another company's trailer is not ours: recorded as a customer / shipper trailer, never as our fleet trailer
    expect(await creatorTrailerChoice(db as never, draft({ trailer_equipment_number: foreignTrailerNumber }))).toEqual({ kind: "customer", trailer_number: foreignTrailerNumber });
    expect(await creatorTrailerChoice(db as never, draft({ trailer_none: true }))).toEqual({ kind: "none" });
    expect(await creatorTrailerChoice(db as never, draft())).toBeNull();
  });

  it("preview refuses trailer_required for a load it would book, never for a load that already exists", async () => {
    const refusals = await creatorPreflightRefusals(db as never, draft());
    expect(refusals.some((r) => r.includes("trailer_required") && r.includes(`NEW-${suf}`))).toBe(true);
    const ok = await creatorPreflightRefusals(db as never, draft({ trailer_none: true }));
    expect(ok.some((r) => r.includes("trailer_required"))).toBe(false);
    const adopted = await creatorPreflightRefusals(db as never, draft({ loads: [{ load_number: existingLoadNumber } as SettlementCreatorDraft["loads"][number]] }));
    expect(adopted.some((r) => r.includes("trailer_required"))).toBe(false);
  });

  it("the seed refuses to book a load the document gives no trailer, before anything is written", async () => {
    await db.query("BEGIN");
    try {
      const before = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM mdata.loads WHERE operating_company_id = $1::uuid`, [companyId])).rows[0]!.n;
      const err = await ensureDispatchedLoadsForCreator(db as never, { uuid: TEST_OWNER_USER_ID, role: "Owner" }, draft()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SettlementCreatorSeedError);
      expect((err as SettlementCreatorSeedError).code).toBe("trailer_required");
      expect(String((err as Error).message)).toContain(CREATOR_TRAILER_REQUIRED_MESSAGE);
      const after = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM mdata.loads WHERE operating_company_id = $1::uuid`, [companyId])).rows[0]!.n;
      expect(after).toBe(before);
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("the document's fleet trailer is recorded on the load as its assignment trailer", async () => {
    await db.query("BEGIN");
    try {
      const loadId = (await db.query<{ id: string }>(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, is_sample_data)
         VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, true) RETURNING id::text AS id`,
        [companyId, `L109-${suf}`, customerId, TEST_OWNER_USER_ID, trailerTypeId],
      )).rows[0]!.id;
      const choice = await creatorTrailerChoice(db as never, draft({ trailer_equipment_number: ownTrailerNumber }));
      const resolved = await resolveTrailerChoice(db as never, companyId, choice);
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;
      await applyTrailerChoice(db as never, { operatingCompanyId: companyId, loadId, actorUserId: TEST_OWNER_USER_ID, choice: resolved.choice, assignmentMethod: "full_form" });
      const hist = await db.query<{ new_trailer_id: string }>(
        `SELECT new_trailer_id::text FROM dispatch.load_assignment_history WHERE load_id = $1::uuid AND new_trailer_id IS NOT NULL`,
        [loadId],
      );
      expect(hist.rows.map((r) => r.new_trailer_id)).toEqual([ownTrailerId]);
      const load = await db.query<{ trailer_source: string }>(`SELECT trailer_source FROM mdata.loads WHERE id = $1::uuid`, [loadId]);
      expect(load.rows[0]!.trailer_source).toBe("company");
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
