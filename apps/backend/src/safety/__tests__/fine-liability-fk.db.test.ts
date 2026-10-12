/**
 * LEAD 443.120 A — safety.civil_fines.converted_to_liability_id is a real foreign key to
 * driver_finance.driver_liabilities(id) (real Postgres). A fine pointer outlived its liability (a dangling pointer the
 * Owner had to clear by hand); with the FK a fine can never point at a liability that does not exist, and a referenced
 * liability cannot be deleted (liabilities are voided, never deleted).
 * On the old code (no FK) the pointer UPDATE to a random uuid succeeds — the first case fails there.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";

const run = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

run("443.120 A — fine converted_to_liability_id FK", () => {
  let db: pg.Client;
  let isolated: IsolatedOperatingCompany;
  let companyId: string;
  const s = randomUUID().slice(0, 6);
  const driverId = randomUUID();

  async function tx<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls='lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      const r = await fn();
      await db.query("COMMIT");
      return r;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function newFine(): Promise<string> {
    const id = randomUUID();
    await tx(() =>
      db.query(
        `INSERT INTO safety.civil_fines (id, operating_company_id, subject_type, subject_driver_id, issued_by_authority, jurisdiction,
                                         violation_description, issued_date, amount_cents, status)
         VALUES ($1::uuid, $2::uuid, 'driver', $3::uuid, 'TX DPS', 'TX', $4, CURRENT_DATE, 10000, 'open')`,
        [id, companyId, driverId, `FK probe ${s}`]
      )
    );
    return id;
  }
  const point = (fineId: string, liabilityId: string) =>
    tx(() =>
      db.query(`UPDATE safety.civil_fines SET converted_to_liability_id = $2::uuid WHERE id = $1::uuid`, [fineId, liabilityId])
    );

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    isolated = await createIsolatedOperatingCompany({ label: "c120a-fine-fk" });
    companyId = isolated.companyId;
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL!));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await tx(() =>
      db.query(
        `INSERT INTO mdata.drivers (id,operating_company_id,first_name,last_name,phone,status) VALUES ($1::uuid,$2::uuid,'Fk','Driver',$3,'Active')`,
        [driverId, companyId, `95613${s.slice(0, 5)}`]
      )
    );
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await tx(async () => {
        if (isolated) await deactivateIsolatedOperatingCompany(db, isolated);
      });
    } catch {
      /* best effort */
    }
    await db.end();
  });

  it("refuses a pointer to a liability that does not exist (FK 23503)", async () => {
    const fineId = await newFine();
    await expect(point(fineId, randomUUID())).rejects.toMatchObject({ code: "23503" });
  });

  it("accepts a pointer to a real liability and refuses deleting that liability while referenced", async () => {
    const fineId = await newFine();
    const liabilityId = randomUUID();
    await tx(() =>
      db.query(
        `INSERT INTO driver_finance.driver_liabilities (id, operating_company_id, driver_id, type, source_description, original_amount, current_balance)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'fine', $4, 100, 100)`,
        [liabilityId, companyId, driverId, `FK probe ${s}`]
      )
    );
    await point(fineId, liabilityId);
    await expect(
      // the app role holds no DELETE grant on liabilities; step out of it to prove the FK itself holds (rolled back)
      tx(async () => {
        await db.query("RESET ROLE");
        await db.query(`DELETE FROM driver_finance.driver_liabilities WHERE id = $1::uuid`, [liabilityId]);
      })
    ).rejects.toMatchObject({ code: "23503" });
  });
});
