import { describe, expect, it } from "vitest";
import { withLuciaBypass } from "../auth/db.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(!process.env.DATABASE_URL);

describeIntegration("samsara remote counts migration", () => {
  it("creates integrations.samsara_remote_counts and helper index", async () => {
    await ensureIntegrationPrerequisites();
    await withLuciaBypass(async (client) => {
      const tableRes = await client.query<{ regclass: string | null }>(
        `SELECT to_regclass('integrations.samsara_remote_counts')::text AS regclass`
      );
      expect(tableRes.rows[0]?.regclass).toBe("integrations.samsara_remote_counts");

      const indexRes = await client.query<{ indexname: string }>(
        `
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'integrations'
            AND tablename = 'samsara_remote_counts'
            AND indexname = 'ix_samsara_remote_counts_latest'
        `
      );
      expect(indexRes.rows[0]?.indexname).toBe("ix_samsara_remote_counts_latest");
    });
  });

  it("creates webhook entity latest index for race-window query", async () => {
    await ensureIntegrationPrerequisites();
    await withLuciaBypass(async (client) => {
      const indexRes = await client.query<{ indexname: string }>(
        `
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'integrations'
            AND tablename = 'samsara_webhook_events'
            AND indexname = 'ix_samsara_webhook_events_entity_latest'
        `
      );
      expect(indexRes.rows[0]?.indexname).toBe("ix_samsara_webhook_events_entity_latest");
    });
  });
});
