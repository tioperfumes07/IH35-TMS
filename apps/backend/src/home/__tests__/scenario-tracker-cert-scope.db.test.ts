/**
 * #4469 — SCENARIO-TRACKER CERT SCOPE, real Postgres.
 *
 * The defect: currentCert() matched `operating_company_id IS NULL` for every entity and ordered only
 * by verified_at, so an entity cert and the ALL row were both eligible with the SAME timestamp and
 * the winner was whatever the planner happened to return. The ALL row won often enough that USMCA
 * certifications were reported as TRANSP's state across all 23 scenario keys.
 *
 * These tests plant BOTH rows with an IDENTICAL verified_at on purpose. A test that merely asserts
 * "a cert was found" passes on the broken code — it reproduces the bug instead of catching it. The
 * only assertion that discriminates is WHICH row came back, under a tie.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany, ensureIntegrationPrerequisites, deactivateIsolatedOperatingCompany,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";

const run = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

// The exact predicate + ordering shipped in scenario-tracker.service.ts currentCert(). Kept here as
// one string so the test exercises the real SQL rather than a paraphrase of it.
const CERT_SQL = `
  SELECT evidence, operating_company_id::text AS operating_company_id
    FROM audit.scenario_status
   WHERE is_current
     AND scenario_key = $1
     AND (CASE WHEN $2::uuid IS NULL
               THEN operating_company_id IS NULL
               ELSE (operating_company_id = $2::uuid OR operating_company_id IS NULL)
          END)
   ORDER BY CASE
              WHEN $2::uuid IS NOT NULL AND operating_company_id = $2::uuid THEN 0
              WHEN operating_company_id IS NULL THEN 1
              ELSE 2
            END,
            verified_at DESC,
            id DESC
   LIMIT 1`;

run("#4469 · scenario-tracker cert scope (real Postgres)", () => {
  let db: pg.Client; let companyId: string; let isolated: IsolatedOperatingCompany; let otherId: string;
  let otherIsolated: IsolatedOperatingCompany;
  const key = `hop.scope-test.${randomUUID().slice(0, 8)}`;
  // ONE timestamp for every planted row — the tie is the entire point of this fixture.
  const STAMP = "2026-08-05T12:00:00Z";

  async function tx<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls='lucia'");
    try { const r = await fn(); await db.query("COMMIT"); return r; }
    catch (e) { await db.query("ROLLBACK").catch(()=>{}); throw e; }
  }
  async function cert(entity: string | null) {
    return tx(async () => (await db.query(CERT_SQL, [key, entity])).rows[0] as
      { evidence: string; operating_company_id: string | null } | undefined);
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    isolated = await createIsolatedOperatingCompany(db, `cert-scope-a-${randomUUID().slice(0,6)}`);
    companyId = isolated.companyId;
    otherIsolated = await createIsolatedOperatingCompany(db, `cert-scope-b-${randomUUID().slice(0,6)}`);
    otherId = otherIsolated.companyId;

    await tx(async () => {
      const ins = `INSERT INTO audit.scenario_status
        (scenario_key, operating_company_id, stage, state, evidence, verified_by, verified_at, is_current)
        VALUES ($1,$2,$3,'go',$4,'CI-PROBE',$5::timestamptz,true)`;
      await db.query(ins, [key, null, "merged", "ALL-scope row", STAMP]);
      await db.query(ins, [key, companyId, "passed", "ENTITY-A row", STAMP]);
      await db.query(ins, [key, otherId, "complete", "ENTITY-B row", STAMP]);
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await tx(async () => { await db.query(`DELETE FROM audit.scenario_status WHERE scenario_key=$1`, [key]); });
      await tx(async () => {
        if (isolated) await deactivateIsolatedOperatingCompany(db, isolated);
        if (otherIsolated) await deactivateIsolatedOperatingCompany(db, otherIsolated);
      });
    } catch { /* best effort */ }
    await db.end();
  });

  it("entity read returns THAT entity's cert, not the ALL row, on an identical timestamp", async () => {
    const a = await cert(companyId);
    expect(a?.evidence).toBe("ENTITY-A row");
    expect(a?.operating_company_id).toBe(companyId);
  });

  it("a second entity gets ITS OWN cert — no cross-entity credit", async () => {
    const b = await cert(otherId);
    // The bug reported in #4469 was exactly this: one entity's certification surfacing as another's.
    expect(b?.evidence).toBe("ENTITY-B row");
    expect(b?.operating_company_id).toBe(otherId);
  });

  it("ALL-scope read returns ONLY the ALL row — it must not inherit an entity's cert", async () => {
    const all = await cert(null);
    expect(all?.evidence).toBe("ALL-scope row");
    expect(all?.operating_company_id).toBeNull();
  });

  it("falls back to the ALL row for an entity that has no cert of its own", async () => {
    const fresh = await createIsolatedOperatingCompany(db, `cert-scope-c-${randomUUID().slice(0,6)}`);
    try {
      const c = await cert(fresh.companyId);
      // Fallback is intended behaviour — an entity with no cert inherits the programme-wide row.
      expect(c?.evidence).toBe("ALL-scope row");
      expect(c?.operating_company_id).toBeNull();
    } finally {
      await tx(async () => { await deactivateIsolatedOperatingCompany(db, fresh); });
    }
  });
});
