/**
 * Concentration check (owner 2026-11-27 20:59 CT): a tester / set with no concentration takes it from the same fragrance on another
 * item (spaces and set words ignored) or from its own vendor lines; disagreeing lists are a conflict; non-fragrances are left out.
 * Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { concCheck, concCheckQuery } from "./conc-check.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("concentration check (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  it("Night Dive tester → EDT from the regular bottle; a set conflicting → conflict; a deodorant is left out", async () => {
    const item = async (brand: string, name: string, size: number | null, conc: string, pt: string | null) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, identity_key, loose_key, display_name, product_type)
       VALUES ($1, $2, $3, $4, 'M', $5, 'x', $6, $7) RETURNING id::text`,
      [brand, name, size, conc, `${brand}|${name}|${size}|${conc}|${pt}`, `${brand} · ${name}${conc ? ` · ${conc}` : ""}`, pt])).rows[0]!.id;
    await item("ZZDAVIDOFF", "COOL WATER NIGHT DIVE", 125, "EDT", "Regular");
    const tester = await item("ZZDAVIDOFF", "COOLWATER NIGHTDIVE", 125, "", "Tester");
    await item("ZZPACO", "ONE MILLION", 100, "EDT", "Regular");
    await item("ZZPACO", "ONE MILLION", 200, "PARFUM", "Regular");
    const set = await item("ZZPACO", "ONE MILLION 3PCS SET", 100, "", "Set");
    const deo = await item("ZZPACO", "ONE MILLION DEO", 150, "", "Deodorant");
    const r = await concCheck(db as never, concCheckQuery.parse({ q: "zz", limit: 500 }));
    const by = Object.fromEntries(r.rows.map((x) => [x.id, x]));
    expect(by[tester]).toMatchObject({ status: "proposed", proposed: "EDT", items_n: 1 });
    expect(by[tester]!.evidence[0]).toContain("NIGHT DIVE");
    expect(by[set]).toMatchObject({ status: "conflict", proposed: null });
    expect(by[deo]).toBeUndefined();
    const only = await concCheck(db as never, concCheckQuery.parse({ q: "zz", status: "proposed" }));
    expect(only.rows.map((x) => x.id)).toEqual([tester]);
    expect(only.counts).toMatchObject({ proposed: 1, conflict: 1 });
  });
});
