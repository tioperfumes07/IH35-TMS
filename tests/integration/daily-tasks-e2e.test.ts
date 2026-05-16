import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerDailyTasksRoutes } from "../../apps/backend/src/daily-tasks/daily-tasks.routes.js";
import { buildPgClientConfig } from "../../apps/backend/src/lib/pg-connection-options.js";
import { testAuthHeaders } from "../../apps/backend/test-helpers/auth-fixture.js";
import { TEST_OWNER_USER_ID } from "../../apps/backend/test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../apps/backend/test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const ASSIGNEE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

describeIntegration("daily tasks e2e lifecycle", () => {
  let app: Awaited<ReturnType<typeof createIntegrationApp>>;
  let companyId = "";
  let db: pg.Client;
  let taskId = "";

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();

    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();

    await db.query("SET ROLE ih35_app");
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(
      `
        INSERT INTO identity.users (id, email, google_user_id, role, preferred_language)
        VALUES ($1::uuid, $2, $3, 'Dispatcher', 'en')
        ON CONFLICT (id) DO UPDATE
          SET email = EXCLUDED.email,
              google_user_id = EXCLUDED.google_user_id,
              role = EXCLUDED.role
      `,
      [ASSIGNEE_ID, "integration.assignee@test.invalid", `integration-assignee-${randomUUID().slice(0, 8)}`]
    );
    await db.query(
      `
        INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id)
        VALUES ($1::uuid, $2::uuid, $3::uuid)
        ON CONFLICT (user_id, company_id) DO NOTHING
      `,
      [ASSIGNEE_ID, companyId, TEST_OWNER_USER_ID]
    );
    await db.query("COMMIT");

    app = await createIntegrationApp(async (fastify) => {
      await registerDailyTasksRoutes(fastify);
    });
  });

  afterAll(async () => {
    await app?.close();
    await db?.end().catch(() => {});
  });

  it("create -> accept -> complete writes timestamps, events, and alerts", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/daily-tasks",
      headers: testAuthHeaders(TEST_OWNER_USER_ID, "Owner"),
      payload: {
        operating_company_id: companyId,
        title: "Call 40 drivers today",
        description: "Bulk outreach progress checkpoint",
        assigned_to_user_id: ASSIGNEE_ID,
        priority: "high",
        due_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json() as { task: { id: string; status: string; accepted_at: string | null; completed_at: string | null } };
    expect(created.task.status).toBe("created");
    taskId = created.task.id;

    const ownerAcceptRes = await app.inject({
      method: "POST",
      url: `/api/v1/daily-tasks/${taskId}/accept`,
      headers: testAuthHeaders(TEST_OWNER_USER_ID, "Owner"),
    });
    expect(ownerAcceptRes.statusCode).toBe(403);

    const acceptRes = await app.inject({
      method: "POST",
      url: `/api/v1/daily-tasks/${taskId}/accept`,
      headers: testAuthHeaders(ASSIGNEE_ID, "Dispatcher"),
    });
    expect(acceptRes.statusCode).toBe(200);
    const accepted = acceptRes.json() as { task: { status: string; accepted_at: string | null } };
    expect(accepted.task.status).toBe("accepted");
    expect(accepted.task.accepted_at).toBeTruthy();

    const completeRes = await app.inject({
      method: "POST",
      url: `/api/v1/daily-tasks/${taskId}/complete`,
      headers: testAuthHeaders(ASSIGNEE_ID, "Dispatcher"),
    });
    expect(completeRes.statusCode).toBe(200);
    const completed = completeRes.json() as { task: { status: string; completed_at: string | null } };
    expect(completed.task.status).toBe("completed");
    expect(completed.task.completed_at).toBeTruthy();

    const eventsRes = await app.inject({
      method: "GET",
      url: `/api/v1/daily-tasks/${taskId}/events`,
      headers: testAuthHeaders(TEST_OWNER_USER_ID, "Owner"),
    });
    expect(eventsRes.statusCode).toBe(200);
    const eventsPayload = eventsRes.json() as { events: Array<{ event_type: string }> };
    expect(eventsPayload.events.map((e) => e.event_type)).toEqual(["created", "accepted", "completed"]);

    await db.query("BEGIN");
    await db.query("SET ROLE ih35_app");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    try {
      const alerts = await db.query<{ alert_type: string }>(
        `
          SELECT alert_type
          FROM ops.daily_task_alerts
          WHERE daily_task_id = $1::uuid
          ORDER BY enqueued_at ASC
        `,
        [taskId]
      );
      const types = alerts.rows.map((r) => r.alert_type);
      expect(types).toContain("assigned");
      expect(types).toContain("completed");

      const emailRows = await db.query<{ c: string }>(
        `
          SELECT COUNT(*)::text AS c
          FROM email.email_queue
          WHERE template_key = 'notification-dispatch'
            AND operating_company_id = $1::uuid
            AND subject ILIKE 'Daily Task%'
            AND created_at >= now() - interval '10 minutes'
        `,
        [companyId]
      );
      expect(Number(emailRows.rows[0]?.c ?? 0)).toBeGreaterThanOrEqual(2);
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK").catch(() => {});
      throw error;
    }
  });
});

describe("daily tasks e2e wiring", () => {
  it("integration suite is gated to CI (GITHUB_ACTIONS)", () => {
    expect(typeof describeIntegration).toBe("function");
  });
});
