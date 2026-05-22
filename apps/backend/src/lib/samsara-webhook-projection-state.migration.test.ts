import { beforeAll, describe, expect, it } from "vitest";
import { withLuciaBypass } from "../auth/db.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(!process.env.DATABASE_URL);

describeIntegration("samsara webhook projection state migration", () => {
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
  });

  it("creates projection state table and pending index", async () => {
    const result = await withLuciaBypass(async (client) => {
      const table = await client.query<{ regclass: string | null }>(
        `SELECT to_regclass('integrations.samsara_webhook_projection_state')::text AS regclass`
      );
      const indexPending = await client.query<{ regclass: string | null }>(
        `SELECT to_regclass('integrations.ix_samsara_projection_state_pending')::text AS regclass`
      );
      return {
        table: table.rows[0]?.regclass ?? null,
        indexPending: indexPending.rows[0]?.regclass ?? null,
      };
    });

    expect(result.table).toBe("integrations.samsara_webhook_projection_state");
    expect(result.indexPending).toBe("integrations.ix_samsara_projection_state_pending");
  });

  it("creates raw event dedupe index", async () => {
    const dedupe = await withLuciaBypass(async (client) => {
      const idx = await client.query<{ regclass: string | null }>(
        `SELECT to_regclass('integrations.ix_samsara_webhook_events_event_id_dedupe')::text AS regclass`
      );
      return idx.rows[0]?.regclass ?? null;
    });
    expect(dedupe).toBe("integrations.ix_samsara_webhook_events_event_id_dedupe");
  });
});
