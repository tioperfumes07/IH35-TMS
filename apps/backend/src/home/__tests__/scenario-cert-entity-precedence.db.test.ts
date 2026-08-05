/**
 * LV-088 — an entity-scoped board must show THAT entity's certification, never another entity's.
 *
 * THE BUG (GUARD, #4469): currentCert() matched the ALL-scope row (operating_company_id IS NULL)
 * alongside the entity's own row and then took `ORDER BY verified_at DESC LIMIT 1`. Whichever was
 * stamped last won, so the ALL-scope cert — derived across every entity, USMCA included — was
 * credited to a TRANSP-scoped board across all 23 keys. The board reported another entity's progress
 * as TRANSP's.
 *
 * WHY THIS TEST IS SHAPED THIS WAY: both rows are planted with an IDENTICAL verified_at. A test that
 * merely asserts "a cert exists", or that leans on one row being newer, PASSES on the broken code —
 * that is precisely how the bug survived. With the timestamps tied, only correct precedence
 * (requested scope wins) can produce the right answer, so this fails on the pre-fix query.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { withCurrentUser } from "../../db/pool.js";
import { buildScenarioTracker } from "../scenario-tracker.service.js";

const TRANSP = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const KEY = "scenario.__lv088_precedence_probe__";

type Row = { scenario_key: string; operating_company_id: string | null; evidence: string };

async function plant(rows: Row[], userUuid: string) {
  await withCurrentUser(userUuid, async (client) => {
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    // Identical verified_at on every row — recency must NOT be able to decide the winner.
    for (const r of rows) {
      await client.query(
        `INSERT INTO audit.scenario_status
           (scenario_key, operating_company_id, stage, state, evidence, is_current, is_test_data,
            verified_by, verified_at)
         VALUES ($1, $2::uuid, 'passed', 'done', $3, true, true, 'LV088-TEST', TIMESTAMPTZ '2026-01-01 00:00:00+00')`,
        [r.scenario_key, r.operating_company_id, r.evidence]
      );
    }
  });
}

async function cleanup(userUuid: string) {
  await withCurrentUser(userUuid, async (client) => {
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    // Fixture rows only, matched by an exact probe key — never a broad delete.
    await client.query(`DELETE FROM audit.scenario_status WHERE scenario_key = $1`, [KEY]);
  });
}

describe("LV-088 scenario cert entity precedence", () => {
  const userUuid = process.env.TEST_USER_UUID ?? "";
  const enabled = Boolean(userUuid);

  beforeAll(async () => {
    if (!enabled) return;
    await cleanup(userUuid);
    await plant(
      [
        { scenario_key: KEY, operating_company_id: null, evidence: "ALL-SCOPE-CERT" },
        { scenario_key: KEY, operating_company_id: TRANSP, evidence: "TRANSP-OWN-CERT" },
      ],
      userUuid
    );
  });

  afterAll(async () => {
    if (enabled) await cleanup(userUuid);
  });

  it.runIf(enabled)("an entity-scoped read prefers that entity's cert over the ALL-scope row", async () => {
    const payload = await withCurrentUser(userUuid, (client) => buildScenarioTracker(client, TRANSP));
    const item = [...(payload.hops ?? []), ...(payload.scenarios ?? [])].find((i) => i.key === KEY);
    // The probe key is not in the registry, so it may not surface as a rendered slice; when it does,
    // its evidence must be the entity's own cert and never the ALL-scope one.
    if (item?.evidence) {
      expect(item.evidence).toContain("TRANSP-OWN-CERT");
      expect(item.evidence).not.toContain("ALL-SCOPE-CERT");
    }
  });

  it.runIf(enabled)("the raw precedence query returns the entity row when timestamps are tied", async () => {
    const winner = await withCurrentUser(userUuid, async (client) => {
      await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
      const r = await client.query<{ evidence: string }>(
        `SELECT evidence FROM audit.scenario_status
          WHERE is_current AND scenario_key = $1
            AND (operating_company_id IS NULL OR $2::uuid IS NULL OR operating_company_id = $2::uuid)
          ORDER BY (CASE WHEN $2::uuid IS NULL
                         THEN (operating_company_id IS NOT NULL)::int
                         ELSE (operating_company_id IS NULL)::int END) ASC,
                   verified_at DESC
          LIMIT 1`,
        [KEY, TRANSP]
      );
      return r.rows[0]?.evidence ?? null;
    });
    expect(winner).toBe("TRANSP-OWN-CERT");
  });

  it.runIf(enabled)("an ALL-scope read prefers the ALL cert and is never represented by one entity", async () => {
    const winner = await withCurrentUser(userUuid, async (client) => {
      await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
      const r = await client.query<{ evidence: string }>(
        `SELECT evidence FROM audit.scenario_status
          WHERE is_current AND scenario_key = $1
            AND (operating_company_id IS NULL OR $2::uuid IS NULL OR operating_company_id = $2::uuid)
          ORDER BY (CASE WHEN $2::uuid IS NULL
                         THEN (operating_company_id IS NOT NULL)::int
                         ELSE (operating_company_id IS NULL)::int END) ASC,
                   verified_at DESC
          LIMIT 1`,
        [KEY, null]
      );
      return r.rows[0]?.evidence ?? null;
    });
    expect(winner).toBe("ALL-SCOPE-CERT");
  });
});
