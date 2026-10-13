/**
 * safety.accidents.location_lat / location_lng are READ: the damage-event attribution surface shows where a safety
 * accident happened (real Postgres). Before this, the columns (restated from prod by migration 202615720912) had no app
 * reader at all — on the old code the event carries no `location` (undefined), so the assertion below fails.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { computeDamageEventAttribution } from "../damage-event-attribution.service.js";

const run = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

run("damage-event attribution shows where a safety accident happened", () => {
  let db: pg.Client;
  let isolated: IsolatedOperatingCompany;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    isolated = await createIsolatedOperatingCompany({ label: "c133-accident-location" });
    companyId = isolated.companyId;
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL!));
    await db.connect();
    await refuseProductionDatabase(db);
  });

  afterAll(async () => {
    await deactivateIsolatedOperatingCompany(db, isolated);
    await db.end();
  });

  it("returns location {lat,lng} for an accident that records it, null for one that does not", async () => {
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
      const withLoc = randomUUID();
      const noLoc = randomUUID();
      await db.query(
        `INSERT INTO safety.accidents (id, operating_company_id, event_datetime, location_text, location_lat, location_lng, accident_type)
         VALUES ($1::uuid, $3::uuid, '2026-10-01T15:00:00Z', 'I-35 MM 12, Laredo TX', 27.5306, -99.4803, 'property'),
                ($2::uuid, $3::uuid, '2026-10-02T15:00:00Z', 'Yard', NULL, NULL, 'property')`,
        [withLoc, noLoc, companyId]
      );
      const coverage = await computeDamageEventAttribution(db as never, companyId, "2026-09-30T00:00:00Z", "2026-10-05T00:00:00Z");
      const a = coverage.events.find((e) => e.event_id === withLoc);
      const b = coverage.events.find((e) => e.event_id === noLoc);
      expect(a?.source).toBe("safety_accident");
      expect(a?.location).toEqual({ lat: 27.5306, lng: -99.4803 });
      expect(b?.location).toBeNull();
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
