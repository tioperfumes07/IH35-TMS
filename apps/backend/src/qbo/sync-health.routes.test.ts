import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withLuciaBypass } from "../auth/db.js";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import {
  ensureIntegrationPrerequisites,
  ensureSecondEntityLoad,
} from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerQboSyncHealthRoutes } from "./sync-health.routes.js";

// Real-Postgres integration test (runs in CI which sets DATABASE_URL / GITHUB_ACTIONS).
const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describe("qbo sync-health.routes (auth gates)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerQboSyncHealthRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/qbo/sync-health?operating_company_id=00000000-0000-0000-0000-000000000001",
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects Driver callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/qbo/sync-health?operating_company_id=00000000-0000-0000-0000-000000000001",
      headers: testAuthHeaders(undefined, "Driver"),
    });
    expect(res.statusCode).toBe(403);
  });
});

describeIntegration("qbo sync-health latest_run reflects the master-data (CDC) sync (HOME-7)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    app = await createIntegrationApp(async (a) => {
      await registerQboSyncHealthRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("surfaces a completed mdata.qbo_sync_runs run as latest_run even when qbo.sync_runs is empty for the opco", async () => {
    // Use a second entity that has no push-sync (qbo.sync_runs) history so the only recorded run is
    // the recurring master-data CDC run. Pre-fix this returned latest_run=null → the card showed
    // "never/No runs" on a page whose per-domain badge said "synced HH:MM".
    const { companyId: opco } = await ensureSecondEntityLoad();

    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [opco]);
      // No push-sync run should exist for this fresh entity.
      const pushRuns = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM qbo.sync_runs WHERE operating_company_id = $1::uuid`,
        [opco]
      );
      expect(Number(pushRuns.rows[0]?.c ?? -1)).toBe(0);

      // Seed a completed master-data (CDC) run — the source that feeds the per-domain "synced" badge.
      await client.query(
        `
          INSERT INTO mdata.qbo_sync_runs
            (operating_company_id, entity_type, sync_type, started_at, finished_at, error_message)
          VALUES ($1::uuid, 'vendor', 'delta', now() - interval '2 minutes', now(), NULL)
        `,
        [opco]
      );
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/qbo/sync-health?operating_company_id=${opco}`,
      headers: testAuthHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      latest_run: { status: string; completed_at: string | null; run_kind: string | null } | null;
    };

    // The card reads latest_run.completed_at for "Last run" — it must NOT be null now.
    expect(body.latest_run).not.toBeNull();
    expect(body.latest_run?.status).toBe("success");
    expect(body.latest_run?.completed_at).toBeTruthy();
    const completedMs = Date.parse(String(body.latest_run?.completed_at));
    expect(Number.isNaN(completedMs)).toBe(false);
    // Completed within the last 10 minutes (the run we just seeded).
    expect(Date.now() - completedMs).toBeLessThan(10 * 60 * 1000);
  });
});
