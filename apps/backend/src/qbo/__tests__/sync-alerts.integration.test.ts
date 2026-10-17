import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerQboSyncAlertsRoutes } from "../sync-alerts.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("sync-alerts.routes integration", () => {
  let app: FastifyInstance;
  let companyId: string;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerQboSyncAlertsRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/qbo/sync/alerts rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/qbo/sync/alerts?operating_company_id=${companyId}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/qbo/sync/alerts rejects Dispatcher callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/qbo/sync/alerts?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Dispatcher"),
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET /api/v1/qbo/sync/alerts lists alerts for accounting callers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/qbo/sync/alerts?operating_company_id=${companyId}&limit=10`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { alerts?: unknown };
    expect(Array.isArray(body.alerts)).toBe(true);
  });

  it("POST /api/v1/qbo/sync/alerts/:alertId/acknowledge rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/qbo/sync/alerts/${randomUUID()}/acknowledge`,
      payload: { operating_company_id: companyId },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/qbo/sync/alerts/:alertId/acknowledge returns 404 when alert is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/qbo/sync/alerts/${randomUUID()}/acknowledge`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") },
      payload: { operating_company_id: companyId },
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/v1/qbo/sync/alerts/:alertId/retry-now rejects Accountant callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/qbo/sync/alerts/${randomUUID()}/retry-now`,
      headers: { "content-type": "application/json", ...testAuthHeaders(undefined, "Accountant") },
      payload: { operating_company_id: companyId },
    });
    expect(res.statusCode).toBe(403);
  });
});

// LEAD 443.199 — the list filters, cursor paging and the two success paths had no test: the route's own branches
// (resolved true/false, severity list, cursor decode incl. a malformed cursor, acknowledge + retry-now writes) were
// unexercised, which is what dragged test:coverage under its line/branch floor. Real rows in the CI database.
describeIntegration("sync-alerts.routes integration — filters, paging, acknowledge + retry writes", () => {
  let app: FastifyInstance;
  let companyId: string;
  let db: pg.Client;
  const marker = `coverage-${randomUUID()}`;
  const ids: string[] = [];
  const owner = () => ({ "content-type": "application/json", ...testAuthHeaders(undefined, "Owner") });

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    app = await createIntegrationApp(async (a) => {
      await registerQboSyncAlertsRoutes(a);
    });
    db = new pg.Client(buildPgClientConfig(String(process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL)));
    await db.connect();
    // three alerts, oldest first: error (open), critical (open), info (resolved)
    for (const [severity, resolved, ageMin] of [["error", false, 3], ["critical", false, 2], ["info", true, 1]] as const) {
      const r = await db.query(
        `INSERT INTO qbo.sync_alerts (operating_company_id, entity_type, operation, error_message, severity, resolved_at, created_at)
         VALUES ($1::uuid, $2, 'sync', 'coverage fixture', $3, CASE WHEN $4 THEN now() END, now() - make_interval(mins => $5))
         RETURNING id::text`,
        [companyId, marker, severity, resolved, ageMin]
      );
      ids.push(r.rows[0].id);
    }
  });

  afterAll(async () => {
    await db.query(`DELETE FROM qbo.sync_alerts WHERE entity_type = $1`, [marker]).catch(() => {});
    await db.end().catch(() => {});
    await app.close();
  });

  const mine = (body: { alerts: Array<{ entity_type?: string; id: string }> }) =>
    body.alerts.filter((a) => a.entity_type === marker).map((a) => a.id);

  it("filters by severity list + open only, and pages with a cursor", async () => {
    const base = `/api/v1/qbo/sync/alerts?operating_company_id=${companyId}&resolved=false&severity=error,critical`;
    const first = await app.inject({ method: "GET", url: `${base}&limit=1`, headers: owner() });
    expect(first.statusCode).toBe(200);
    const p1 = first.json() as { alerts: Array<{ entity_type?: string; id: string; severity: string }>; next_cursor: string | null };
    expect(p1.alerts).toHaveLength(1);
    expect(["error", "critical"]).toContain(p1.alerts[0].severity);
    expect(p1.next_cursor).toEqual(expect.any(String));

    const all: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 500; i += 1) {
      const res = await app.inject({ method: "GET", url: `${base}&limit=200${cursor ? `&cursor=${cursor}` : ""}`, headers: owner() });
      const page = res.json() as { alerts: Array<{ entity_type?: string; id: string }>; next_cursor: string | null };
      all.push(...mine(page));
      cursor = page.next_cursor;
      if (!cursor) break;
    }
    expect(all).toEqual([ids[1], ids[0]]); // newest first, the resolved info row excluded
  });

  it("resolved=true returns only resolved rows; a malformed cursor is ignored, not a 500", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/qbo/sync/alerts?operating_company_id=${companyId}&resolved=true&limit=200&cursor=not-base64-json`,
      headers: owner(),
    });
    expect(res.statusCode).toBe(200);
    const page = res.json() as { alerts: Array<{ entity_type?: string; id: string; resolved_at: string | null }> };
    expect(page.alerts.every((a) => a.resolved_at !== null)).toBe(true);
    const ownRows = mine(page);
    if (ownRows.length) expect(ownRows).toEqual([ids[2]]);
  });

  it("rejects a non-uuid company with 400", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v1/qbo/sync/alerts?operating_company_id=nope`, headers: owner() });
    expect(res.statusCode).toBe(400);
  });

  it("acknowledge stamps the alert and keeps the note", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/qbo/sync/alerts/${ids[0]}/acknowledge`,
      headers: owner(),
      payload: { operating_company_id: companyId, note: "seen" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, id: ids[0] });
    const row = await db.query(`SELECT acknowledged_at, error_payload->>'ack_note' AS note FROM qbo.sync_alerts WHERE id = $1::uuid`, [ids[0]]);
    expect(row.rows[0].acknowledged_at).not.toBeNull();
    expect(row.rows[0].note).toBe("seen");
  });

  it("acknowledge rejects a non-uuid alert id with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/qbo/sync/alerts/not-a-uuid/acknowledge`,
      headers: owner(),
      payload: { operating_company_id: companyId },
    });
    expect(res.statusCode).toBe(400);
  });

  it("retry-now resets the retry clock for an Owner; 404 when missing; 400 on a bad body", async () => {
    const ok = await app.inject({
      method: "POST",
      url: `/api/v1/qbo/sync/alerts/${ids[1]}/retry-now`,
      headers: owner(),
      payload: { operating_company_id: companyId },
    });
    expect(ok.statusCode).toBe(200);
    const row = await db.query(`SELECT retry_count, severity, next_retry_at FROM qbo.sync_alerts WHERE id = $1::uuid`, [ids[1]]);
    expect(row.rows[0]).toMatchObject({ retry_count: 0, severity: "warning" });
    expect(row.rows[0].next_retry_at).not.toBeNull();

    const missing = await app.inject({
      method: "POST",
      url: `/api/v1/qbo/sync/alerts/${randomUUID()}/retry-now`,
      headers: owner(),
      payload: { operating_company_id: companyId },
    });
    expect(missing.statusCode).toBe(404);

    const bad = await app.inject({ method: "POST", url: `/api/v1/qbo/sync/alerts/${ids[1]}/retry-now`, headers: owner(), payload: {} });
    expect(bad.statusCode).toBe(400);
  });
});
