/**
 * AJK-05 (443.113, Codex deep-wiring audit): GET /drivers/:id/merge-preview ran every repoint UPDATE and rolled it back
 * to a savepoint — locks taken and triggers fired by a read. The preview now plans with SELECTs only (planRepoint) and the
 * route runs it in a READ ONLY transaction. Proven on real Postgres: three throw-away reference tables give the three
 * outcomes (moved / kept_on_survivor / history_kept); the preview succeeds inside a READ ONLY transaction (the old code
 * fails there with 25006) and predicts exactly what the measured repoint then does.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { createIsolatedOperatingCompany } from "../../../test-helpers/isolated-company.js";
import { refuseProductionConnectionString } from "../../../test-helpers/refuse-production.js";
import { previewDriverMerge, repointAll } from "../driver-merge.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("AJK-05 driver merge preview is read-only (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;

  beforeAll(async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    companyId = (await createIsolatedOperatingCompany({ label: "ajk05", codePrefix: "AJK" })).companyId;
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
  });

  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end();
  });

  it("previews inside READ ONLY and predicts the measured repoint exactly", async () => {
    const t = `ajk05_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
      const drv = async (first: string) =>
        (await db.query<{ id: string }>(
          `INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1::uuid, $2, 'Merge', '5555550123') RETURNING id::text AS id`,
          [companyId, first]
        )).rows[0]!.id;
      const S = await drv("Survivor");
      const M = await drv("Merged");
      // moved: plain FK
      await db.query(`CREATE TABLE public.${t}_plain (id serial PRIMARY KEY, driver_id uuid REFERENCES mdata.drivers(id))`);
      // kept_on_survivor: 1:1 per driver + slot, survivor already holds the same slot
      await db.query(`CREATE TABLE public.${t}_one (id serial PRIMARY KEY, driver_id uuid REFERENCES mdata.drivers(id), slot text, UNIQUE (driver_id, slot))`);
      // history_kept: an immutability trigger refuses every update
      await db.query(`CREATE TABLE public.${t}_worm (id serial PRIMARY KEY, driver_id uuid REFERENCES mdata.drivers(id))`);
      await db.query(`CREATE FUNCTION public.${t}_refuse() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'append-only: %', TG_TABLE_NAME; END $f$`);
      await db.query(`CREATE TRIGGER ${t}_tg BEFORE UPDATE ON public.${t}_worm FOR EACH ROW EXECUTE FUNCTION public.${t}_refuse()`);
      await db.query(`INSERT INTO public.${t}_plain (driver_id) VALUES ($1::uuid), ($1::uuid)`, [M]);
      await db.query(`INSERT INTO public.${t}_one (driver_id, slot) VALUES ($1::uuid, 'a'), ($2::uuid, 'a')`, [M, S]);
      await db.query(`INSERT INTO public.${t}_worm (driver_id) VALUES ($1::uuid)`, [M]);
      const mine = (refs: Array<{ ref: string; rows: number; status?: string }>) =>
        Object.fromEntries(refs.filter((r) => r.ref.startsWith(`public.${t}_`)).map((r) => [r.ref, [r.status, r.rows]]));

      // The preview runs READ ONLY — any write (the old savepoint rehearsal) is refused by Postgres with 25006.
      await db.query("SAVEPOINT preview");
      await db.query("SET LOCAL transaction_read_only = on");
      const pv = await previewDriverMerge(db as never, { companyId, survivorId: S, mergedId: M });
      await db.query("ROLLBACK TO SAVEPOINT preview");
      const predicted = mine(pv.references);
      expect(predicted).toEqual({
        [`public.${t}_plain.driver_id`]: ["moved", 2],
        [`public.${t}_one.driver_id`]: ["kept_on_survivor", 1],
        [`public.${t}_worm.driver_id`]: ["history_kept", 1],
      });

      // The measured repoint (what the merge does) lands exactly where the preview said.
      const measured = mine(await repointAll(db as never, "mdata.drivers", M, S));
      expect(measured).toEqual(predicted);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
    }
  });
});
