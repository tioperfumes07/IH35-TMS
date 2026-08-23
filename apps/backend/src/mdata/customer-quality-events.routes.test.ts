/**
 * Customer quality events POST/PATCH — company-scope regression guard (real Postgres)
 *
 * LIVE BUG (CUST-F5995): create resolved the caller's DEFAULT company only — it never accepted the
 * operating_company_id the caller had actually selected on Customer Detail, so a customer homed at a
 * NON-default company 404'd on create even though the caller was a real member of that company. void
 * and update were worse: they looked the target event up by event_id + customer_id ALONE, with NO
 * company binding at all — under Owner RLS (org.user_accessible_company_ids() returns every entity for
 * Owner sessions) that let a caller void/edit another company's quality event by naming its UUID.
 *
 * This test seeds a customer at companyB (the caller's non-default membership) and proves:
 *   1. POST create with operating_company_id=companyB explicitly selected succeeds (the selected
 *      company is honored, not just the default).
 *   2. PATCH void/update of that companyB event, when the caller instead selects companyA (a company
 *      they ARE a member of, just not this event's), 404s — cross-company mutation is blocked.
 *   3. PATCH void/update with the correct companyB selection succeeds.
 */

import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, ensureSecondEntityLoad } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerCustomerQualityEventsRoutes } from "./customer-quality-events.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("customer quality events — company scope (CUST-F5995, real Postgres)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let companyA: string; // caller's default company
  let companyB: string; // second membership; where the test customer/event live
  let customerBId: string;
  let eventBId: string;

  async function withBypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const out = await fn();
      await db.query("COMMIT");
      return out;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  beforeAll(async () => {
    companyA = await ensureIntegrationPrerequisites();
    companyB = (await ensureSecondEntityLoad()).companyId;
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");

    await withBypass(async () => {
      const cust = await db.query<{ id: string }>(
        `INSERT INTO mdata.customers (customer_name, operating_company_id) VALUES ($1, $2::uuid) RETURNING id`,
        [`CUST-F5995 companyB customer ${randomUUID().slice(0, 8)}`, companyB]
      );
      customerBId = cust.rows[0]!.id;
    });

    app = await createIntegrationApp(async (a) => {
      await registerCustomerQualityEventsRoutes(a);
    });
  });

  afterAll(async () => {
    await app?.close().catch(() => {});
    if (db) {
      await withBypass(async () => {
        await db.query(`DELETE FROM mdata.customer_quality_events WHERE customer_id = $1::uuid`, [customerBId]);
        await db.query(`DELETE FROM mdata.customers WHERE id = $1::uuid`, [customerBId]);
      }).catch(() => {});
      await db.end().catch(() => {});
    }
  });

  it("POST create honors an explicitly SELECTED non-default company (fix — was: silently default-only)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/mdata/customers/${customerBId}/quality-events?operating_company_id=${companyB}`,
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        event_type: "other",
        event_date: new Date().toISOString().slice(0, 10),
        severity: "info",
        summary: "CUST-F5995 create-honors-selected-company regression guard",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { event?: { id?: string; customer_id?: string } };
    expect(body.event?.customer_id).toBe(customerBId);
    eventBId = body.event!.id!;
  });

  it("POST create 404s when the DEFAULT company (implicit, no operating_company_id) doesn't own the customer", async () => {
    // Proves the bug's other half: with NO operating_company_id at all, resolution falls back to the
    // caller's default (companyA), and companyB's customer correctly is NOT visible there.
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/mdata/customers/${customerBId}/quality-events`,
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        event_type: "other",
        event_date: new Date().toISOString().slice(0, 10),
        severity: "info",
        summary: "CUST-F5995 default-company-mismatch guard",
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "mdata_customer_not_found" });
  });

  it("PATCH void 404s a companyB event when the caller selects companyA (cross-company mutation blocked)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/customers/${customerBId}/quality-events/${eventBId}/void?operating_company_id=${companyA}`,
      headers: testAuthHeaders(undefined, "Owner"),
      payload: { void_reason: "CUST-F5995 cross-company void must be refused" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "customer_quality_event_not_found" });
  });

  it("PATCH update 404s a companyB event when the caller selects companyA (cross-company mutation blocked)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/customers/${customerBId}/quality-events/${eventBId}?operating_company_id=${companyA}`,
      headers: testAuthHeaders(undefined, "Owner"),
      payload: { details: "should not apply" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "customer_quality_event_not_found" });
  });

  it("PATCH update succeeds with the correct companyB selection", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/customers/${customerBId}/quality-events/${eventBId}?operating_company_id=${companyB}`,
      headers: testAuthHeaders(undefined, "Owner"),
      payload: { details: "CUST-F5995 same-company update should apply" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { event?: { details?: string } };
    expect(body.event?.details).toBe("CUST-F5995 same-company update should apply");
  });

  it("PATCH void succeeds with the correct companyB selection", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/customers/${customerBId}/quality-events/${eventBId}/void?operating_company_id=${companyB}`,
      headers: testAuthHeaders(undefined, "Owner"),
      payload: { void_reason: "CUST-F5995 same-company void should apply" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { event?: { voided_at?: string | null } };
    expect(body.event?.voided_at).toBeTruthy();
  });
});

describe("customer quality events route (always-on smoke)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerCustomerQualityEventsRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST quality-events rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/mdata/customers/${randomUUID()}/quality-events`,
      payload: { event_type: "other", event_date: "2026-01-01", severity: "info", summary: "x" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("PATCH void does not 500 for an unknown customer/event pair without DB fixtures", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/mdata/customers/${randomUUID()}/quality-events/${randomUUID()}/void?operating_company_id=${randomUUID()}`,
      headers: testAuthHeaders(undefined, "Owner"),
      payload: { void_reason: "smoke test — company is not a real membership" },
    });
    // A RANDOM operating_company_id is not a company this caller is a member of, so resolution now
    // rejects it before ever touching the event table — never a 500.
    expect(res.statusCode).toBe(404);
  });
});
