/**
 * 443.103 — the hourly real-driven-miles tick rewrote every due load with IDENTICAL values and a fresh computed_at
 * (prod USMCA: all 148 loads, 2 passes an hour, ~296 audit.row_changes rows an hour, mdata.loads.updated_at bumped every
 * hour). persistLoadRealDrivenMiles now writes a row only when a computed value differs from the stored one (or the
 * load was never computed). Proves on an isolated company: first write stamps; an identical re-run writes nothing (no
 * updated_at bump, no audit row); a real change writes again. Each call commits in its own transaction so now() moves.
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { persistLoadRealDrivenMiles, type LoadRealMilesRow } from "../load-real-driven-miles.service.js";
import {
  createIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { insertLoadForInvoice } from "../../../test-helpers/load-born-invoice.js";
import { connectFixtureClient, fixtureTxn } from "../../../test-helpers/posting-gate-proof.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("persistLoadRealDrivenMiles writes only what changed (443.103)", () => {
  let db: pg.Client;
  let iso: IsolatedOperatingCompany;
  let loadId: string;
  const stopA = randomUUID();
  const stopB = randomUUID();

  const rows = (reason: string): LoadRealMilesRow[] => [
    {
      load_id: loadId,
      unit_id: null,
      miles_driven_actual: null,
      source: null,
      reason,
      legs: [
        { stop_id: stopA, sequence_number: 1, kind: "deadhead", from_at: null, to_at: null, miles: null, source: null, reason: "load has no assigned unit" },
        { stop_id: stopB, sequence_number: 2, kind: "loaded", from_at: null, to_at: null, miles: null, source: null, reason: "load has no assigned unit" },
      ],
    },
  ];

  const snapshot = async () =>
    fixtureTxn(db, iso.companyId, async () => {
      const l = await db.query<{ updated_at: string; computed_at: string | null; reason: string | null }>(
        `SELECT updated_at::text, miles_driven_actual_computed_at::text AS computed_at, miles_driven_actual_reason AS reason
           FROM mdata.loads WHERE id = $1::uuid`,
        [loadId]
      );
      const a = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit.row_changes WHERE schema_name = 'mdata' AND row_pk = ANY($1::text[])`,
        [[loadId, stopA, stopB]]
      );
      return { ...l.rows[0], audit: a.rows[0].n };
    });

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = await connectFixtureClient();
    iso = await createIsolatedOperatingCompany({ codePrefix: "RDM", legalNamePrefix: "Real driven miles persist" });
    const customerId = randomUUID();
    await fixtureTxn(db, iso.companyId, async () => {
      await db.query(`INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid, $2::uuid, $3)`, [
        customerId,
        iso.companyId,
        `RDM customer ${customerId.slice(0, 6)}`,
      ]);
      loadId = await insertLoadForInvoice(db, iso.companyId, customerId);
      await db.query(
        `INSERT INTO mdata.load_stops (id, load_id, sequence_number, stop_type) VALUES ($1::uuid, $3::uuid, 1, 'pickup'), ($2::uuid, $3::uuid, 2, 'delivery')`,
        [stopA, stopB, loadId]
      );
    });
  });

  afterAll(async () => {
    await db?.end();
  });

  it("stamps once, re-runs as a no-op, and writes again only on a real change", async () => {
    const first = await fixtureTxn(db, iso.companyId, () => persistLoadRealDrivenMiles(db as never, iso.companyId, rows("no captures yet")));
    expect(first).toBe(1);
    const a = await snapshot();
    expect(a.computed_at).not.toBeNull();
    expect(a.reason).toBe("no captures yet");

    const again = await fixtureTxn(db, iso.companyId, () => persistLoadRealDrivenMiles(db as never, iso.companyId, rows("no captures yet")));
    expect(again).toBe(0);
    const b = await snapshot();
    expect(b.updated_at).toBe(a.updated_at);
    expect(b.computed_at).toBe(a.computed_at);
    expect(b.audit).toBe(a.audit);

    const changed = await fixtureTxn(db, iso.companyId, () => persistLoadRealDrivenMiles(db as never, iso.companyId, rows("odometer captured")));
    expect(changed).toBe(1);
    const c = await snapshot();
    expect(c.reason).toBe("odometer captured");
    expect(c.audit).toBeGreaterThan(b.audit);
  });
});
