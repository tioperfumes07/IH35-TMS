/**
 * ENG-54 UNIT OWNERSHIP ENGINE — real Postgres proof of the row rule in
 * db/migrations/202616570100_unit_lease_owner_asset_holder_engine.sql:
 *   a unit leased to an operating carrier must be owned by an asset holder.
 * Engine (refuse at write), reverse (un-lease / re-own passes), unrelated writes on a unit keep working,
 * and the caller's app.bypass_rls is restored after the rule reads org.companies.
 * Runs only in CI (GITHUB_ACTIONS=true) against a fully-migrated Postgres; never touches production.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { isUnitOwnershipViolation } from "../unit-ownership-rule.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("ENG-54 unit ownership engine (real Postgres)", () => {
  let db: pg.Client;
  const sfx = randomUUID().slice(0, 8);
  const holder = randomUUID();
  const carrier = randomUUID();

  async function tx<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    try {
      const out = await fn();
      await db.query("COMMIT");
      return out;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function insertUnit(owner: string, leasedTo: string | null): Promise<string> {
    const id = randomUUID();
    await tx(() => db.query(
      `INSERT INTO mdata.units (id, unit_number, vin, owner_company_id, currently_leased_to_company_id, status, is_sample_data)
       VALUES ($1, $2, $3, $4, $5, 'InService', true)`,
      [id, `ENG54-${sfx}-${id.slice(0, 4)}`, `ENG54VIN${sfx}${id.slice(0, 4)}`, owner, leasedTo],
    ));
    return id;
  }

  async function refused(p: Promise<unknown>) {
    let err: unknown = null;
    try { await p; } catch (e) { err = e; }
    expect(isUnitOwnershipViolation(err)).toBe(true);
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await tx(() => db.query(
      `INSERT INTO org.companies (id, code, legal_name, company_type)
       VALUES ($1, $3, $4, 'asset_holder'), ($2, $5, $6, 'operating_carrier')`,
      [holder, carrier, `E54H${sfx}`, `ENG54 Holder ${sfx}`, `E54C${sfx}`, `ENG54 Carrier ${sfx}`],
    ));
  });

  afterAll(async () => {
    await db?.end();
  });

  it("refuses a unit leased to an operating carrier and owned by that carrier", async () => {
    await refused(insertUnit(carrier, carrier));
  });

  it("accepts a unit owned by the asset holder and leased to the operating carrier", async () => {
    const id = await insertUnit(holder, carrier);
    const row = (await db.query("SELECT owner_company_id::text o FROM mdata.units WHERE id = $1", [id])).rows[0];
    expect(row?.o).toBe(holder);
  });

  it("refuses re-owning a leased unit to a non-asset-holder (the 2026-09-01 T122/T124/T156 write)", async () => {
    const id = await insertUnit(holder, carrier);
    await refused(tx(() => db.query("UPDATE mdata.units SET owner_company_id = $2 WHERE id = $1", [id, carrier])));
  });

  it("refuses leasing an un-leased carrier-owned unit to an operating carrier", async () => {
    const id = await insertUnit(carrier, null);
    await refused(tx(() => db.query("UPDATE mdata.units SET currently_leased_to_company_id = $2 WHERE id = $1", [id, carrier])));
  });

  it("reverse: un-leasing and re-owning to the asset holder both pass; unrelated writes are untouched", async () => {
    const id = await insertUnit(carrier, null);
    await tx(() => db.query("UPDATE mdata.units SET notes = 'odometer sync' WHERE id = $1", [id]));
    await tx(() => db.query("UPDATE mdata.units SET owner_company_id = $2, currently_leased_to_company_id = $3 WHERE id = $1", [id, holder, carrier]));
    await tx(() => db.query("UPDATE mdata.units SET currently_leased_to_company_id = NULL WHERE id = $1", [id]));
    const row = (await db.query("SELECT owner_company_id::text o, currently_leased_to_company_id::text l FROM mdata.units WHERE id = $1", [id])).rows[0];
    expect(row).toEqual({ o: holder, l: null });
  });

  it("restores the caller's app.bypass_rls after reading org.companies", async () => {
    const id = await insertUnit(holder, null);
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query("UPDATE mdata.units SET currently_leased_to_company_id = $2 WHERE id = $1", [id, carrier]);
      const v = (await db.query("SELECT current_setting('app.bypass_rls', true) AS v")).rows[0]?.v;
      expect(v).toBe("lucia");
    } finally {
      await db.query("ROLLBACK").catch(() => {});
    }
  });
});
