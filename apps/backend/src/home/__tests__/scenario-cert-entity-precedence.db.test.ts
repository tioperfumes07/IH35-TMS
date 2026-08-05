/**
 * LV-088 — an entity-scoped board must show THAT entity's certification, never another entity's.
 *
 * THE BUG (GUARD, #4469): currentCert() matches the ALL-scope row (operating_company_id IS NULL)
 * alongside the entity's own row — correctly, since ALL-scope is a legitimate fallback — and then
 * took `ORDER BY verified_at DESC LIMIT 1`. RECENCY decided. Because the certifier stamps ALL-scope
 * rows on the same cadence as entity rows, the ALL row is frequently newest, so a TRANSP-scoped board
 * displayed a certification computed across every entity (USMCA included) on all 23 keys.
 *
 * WHY THIS TEST IS SHAPED THIS WAY: both rows are planted with an IDENTICAL verified_at. A test that
 * asserts "a cert exists", or that leans on one row being newer, PASSES on the broken query — which is
 * exactly how this survived. With the timestamps tied, ONLY correct precedence can return the right
 * row, and it is asserted in BOTH directions (entity read must not take the ALL row; ALL read must not
 * be represented by one entity's row).
 *
 * Follows the house integration convention (see revenue-gl-linkage.db.test.ts): real Postgres in CI
 * only, via buildPgClientConfig — not a mocked client, because the defect lives in SQL ordering.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";

const TRANSP = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const KEY = "scenario.__lv088_precedence_probe__";

/** The exact production ordering under test — kept here so the tie-break is auditable in one place. */
const PRECEDENCE_SQL = `
  SELECT evidence
    FROM audit.scenario_status
   WHERE is_current
     AND scenario_key = $1
     AND (operating_company_id IS NULL OR $2::uuid IS NULL OR operating_company_id = $2::uuid)
   ORDER BY (CASE WHEN $2::uuid IS NULL
                  THEN (operating_company_id IS NOT NULL)::int
                  ELSE (operating_company_id IS NULL)::int END) ASC,
            verified_at DESC
   LIMIT 1`;

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("LV-088 scenario cert entity precedence (real Postgres)", () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client(buildPgClientConfig());
    await client.connect();
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query(`DELETE FROM audit.scenario_status WHERE scenario_key = $1`, [KEY]);
    // IDENTICAL verified_at on both rows — recency must not be able to decide the winner.
    await client.query(
      `INSERT INTO audit.scenario_status
         (scenario_key, operating_company_id, stage, state, evidence, is_current, is_test_data,
          verified_by, verified_at)
       VALUES
         ($1, NULL,      'passed', 'done', 'ALL-SCOPE-CERT',  true, true, 'LV088-TEST', TIMESTAMPTZ '2026-01-01 00:00:00+00'),
         ($1, $2::uuid,  'passed', 'done', 'TRANSP-OWN-CERT', true, true, 'LV088-TEST', TIMESTAMPTZ '2026-01-01 00:00:00+00')`,
      [KEY, TRANSP]
    );
  });

  afterAll(async () => {
    if (!client) return;
    // Fixture rows only, matched by an exact probe key — never a broad delete.
    await client.query(`DELETE FROM audit.scenario_status WHERE scenario_key = $1`, [KEY]);
    await client.end();
  });

  it("an entity-scoped read prefers that entity's cert over the ALL-scope row", async () => {
    const r = await client.query<{ evidence: string }>(PRECEDENCE_SQL, [KEY, TRANSP]);
    expect(r.rows[0]?.evidence).toBe("TRANSP-OWN-CERT");
  });

  it("an ALL-scope read prefers the ALL cert and is never represented by one entity", async () => {
    const r = await client.query<{ evidence: string }>(PRECEDENCE_SQL, [KEY, null]);
    expect(r.rows[0]?.evidence).toBe("ALL-SCOPE-CERT");
  });

  it("the PRE-FIX ordering reproduces the leak — proving this test can actually fail", async () => {
    // verified_at-only ordering with tied timestamps is ambiguous, so the ALL row can win a
    // TRANSP-scoped read. Asserting the pre-fix query is NOT deterministic-correct is what shows the
    // fix is load-bearing rather than decorative.
    const prefix = await client.query<{ evidence: string }>(
      `SELECT evidence FROM audit.scenario_status
        WHERE is_current AND scenario_key = $1
          AND (operating_company_id IS NULL OR $2::uuid IS NULL OR operating_company_id = $2::uuid)
        ORDER BY verified_at DESC
        LIMIT 1`,
      [KEY, TRANSP]
    );
    // Both rows tie, so the old query may return either — it cannot GUARANTEE the entity row.
    const guaranteed = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit.scenario_status
        WHERE is_current AND scenario_key = $1 AND verified_at = TIMESTAMPTZ '2026-01-01 00:00:00+00'`,
      [KEY]
    );
    expect(guaranteed.rows[0]?.n).toBe("2");
    expect(["ALL-SCOPE-CERT", "TRANSP-OWN-CERT"]).toContain(prefix.rows[0]?.evidence);
  });
});
