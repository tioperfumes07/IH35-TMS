/**
 * E20 Part A -- GET /api/v1/samsara/profiles, GET /api/v1/samsara/mapping-targets,
 * POST /api/v1/samsara/map, POST /api/v1/samsara/unmap (real Postgres). Proves: many profiles
 * map to one driver (no unique constraint collision), map/unmap are idempotent, mapping a
 * profile to a vendor clears any prior driver mapping (the CHECK-constraint invariant), and the
 * resolver suggestion surfaces on an unmapped profile without ever writing anything on its own.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available -- attempting to
 * force-run this locally against production hits the same RLS-GUC gap this repo's other
 * `.db.test.ts` files already disclose (org.user_accessible_company_ids() needs
 * identity.current_user_id()/role set by withCurrentUser, which a raw test connection never
 * does); CI's ephemeral Postgres is the real, honest validator for this file.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../../../test-helpers/db-fixture.js";
import { testAuthHeaders } from "../../../../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../../../../test-helpers/http-app.js";
import { registerSamsaraDriverMappingRoutes } from "../driver-mapping.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("Samsara driver-mapping routes (E20 Part A, real Postgres)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  let driverId: string;
  let vendorId: string;
  let samsaraA: string;
  let samsaraB: string;
  let samsaraUnmapped: string;

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      const result = await fn();
      await db.query("COMMIT");
      return result;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();

    samsaraA = `E20-A-${suffix}`;
    samsaraB = `E20-B-${suffix}`;
    samsaraUnmapped = `E20-U-${suffix}`;

    await bypass(async () => {
      const driverRes = await db.query<{ id: string }>(
        `INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone, status)
         VALUES ($1::uuid, 'Mapping Target', $2, $3, 'Active') RETURNING id`,
        [companyId, `D-${suffix}`, `+1009${suffix.slice(0, 4)}`]
      );
      driverId = driverRes.rows[0]!.id;

      const vendorRes = await db.query<{ id: string }>(
        `INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_code)
         VALUES ($1::uuid, $2, $3) RETURNING id`,
        [companyId, `Mapping Vendor ${suffix}`, `MV-${suffix}`]
      );
      vendorId = vendorRes.rows[0]!.id;

      for (const samsaraId of [samsaraA, samsaraB, samsaraUnmapped]) {
        await db.query(
          `INSERT INTO integrations.samsara_drivers (operating_company_id, samsara_driver_id, raw_payload, last_seen_at)
           VALUES ($1::uuid, $2, $3::jsonb, now())`,
          [companyId, samsaraId, JSON.stringify({ firstName: "Unmapped", lastName: `Profile ${suffix}` })]
        );
      }
    });

    app = await createIntegrationApp(async (a) => {
      await registerSamsaraDriverMappingRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
    await db.end();
  });

  it("MANY PROFILES -> ONE DRIVER: maps two Samsara profiles to the same driver in one call", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/samsara/map",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        samsara_driver_ids: [samsaraA, samsaraB],
        target_kind: "driver",
        target_id: driverId,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { mapped_count: number; missing_samsara_driver_ids: string[] };
    expect(body.mapped_count).toBe(2);
    expect(body.missing_samsara_driver_ids).toEqual([]);

    const row = await bypass(() =>
      db.query<{ local_driver_id: string }>(
        `SELECT local_driver_id::text AS local_driver_id FROM integrations.samsara_drivers WHERE operating_company_id = $1::uuid AND samsara_driver_id = $2`,
        [companyId, samsaraA]
      )
    );
    expect(row.rows[0]?.local_driver_id).toBe(driverId);
  });

  it("mapping the same profile again is idempotent (no error, same target)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/samsara/map",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        samsara_driver_ids: [samsaraA],
        target_kind: "driver",
        target_id: driverId,
      },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { mapped_count: number }).mapped_count).toBe(1);
  });

  it("mapping to a vendor clears any prior driver mapping (the CHECK invariant, enforced at the app layer too)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/samsara/map",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        samsara_driver_ids: [samsaraA],
        target_kind: "vendor",
        target_id: vendorId,
      },
    });
    expect(res.statusCode).toBe(200);

    const row = await bypass(() =>
      db.query<{ local_driver_id: string | null; local_vendor_id: string | null }>(
        `SELECT local_driver_id::text AS local_driver_id, local_vendor_id::text AS local_vendor_id
         FROM integrations.samsara_drivers WHERE operating_company_id = $1::uuid AND samsara_driver_id = $2`,
        [companyId, samsaraA]
      )
    );
    expect(row.rows[0]?.local_driver_id).toBeNull();
    expect(row.rows[0]?.local_vendor_id).toBe(vendorId);
  });

  it("GET /profiles?status=mapped returns the mapped profile with driver_name resolved", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/samsara/profiles?operating_company_id=${companyId}&status=mapped&q=${encodeURIComponent(samsaraB)}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { profiles: Array<{ samsara_driver_id: string; mapped: boolean; driver_name: string | null }> };
    const found = body.profiles.find((p) => p.samsara_driver_id === samsaraB);
    expect(found?.mapped).toBe(true);
    expect(found?.driver_name).toContain("Mapping Target");
  });

  it("GET /profiles?status=unmapped never treats the unmapped profile as a defect and reports a resolver verdict", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/samsara/profiles?operating_company_id=${companyId}&status=unmapped&q=${encodeURIComponent(samsaraUnmapped)}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      profiles: Array<{ samsara_driver_id: string; mapped: boolean; resolver_suggestion: { status: string } }>;
    };
    const found = body.profiles.find((p) => p.samsara_driver_id === samsaraUnmapped);
    expect(found?.mapped).toBe(false);
    // "Unmapped Profile <suffix>" matches no seeded driver name exactly -> unmatched, never a guess.
    expect(found?.resolver_suggestion.status).toBe("unmatched");
  });

  it("GET /mapping-targets?kind=driver&filter=active lists the seeded Active driver", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/samsara/mapping-targets?operating_company_id=${companyId}&kind=driver&filter=active&q=${encodeURIComponent(`Mapping Target D-${suffix}`)}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { targets: Array<{ id: string; kind: string }> };
    expect(body.targets.some((t) => t.id === driverId && t.kind === "driver")).toBe(true);
  });

  it("POST /unmap is idempotent and clears both target columns", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/samsara/unmap",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: { operating_company_id: companyId, samsara_driver_ids: [samsaraB] },
    });
    expect(first.statusCode).toBe(200);
    expect((first.json() as { unmapped_count: number }).unmapped_count).toBe(1);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/samsara/unmap",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: { operating_company_id: companyId, samsara_driver_ids: [samsaraB] },
    });
    expect(second.statusCode).toBe(200);
    expect((second.json() as { unmapped_count: number }).unmapped_count).toBe(1);

    const row = await bypass(() =>
      db.query<{ local_driver_id: string | null; local_vendor_id: string | null }>(
        `SELECT local_driver_id::text AS local_driver_id, local_vendor_id::text AS local_vendor_id
         FROM integrations.samsara_drivers WHERE operating_company_id = $1::uuid AND samsara_driver_id = $2`,
        [companyId, samsaraB]
      )
    );
    expect(row.rows[0]?.local_driver_id).toBeNull();
    expect(row.rows[0]?.local_vendor_id).toBeNull();
  });

  it("404s /map on a target_id that doesn't exist in this company", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/samsara/map",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        samsara_driver_ids: [samsaraUnmapped],
        target_kind: "driver",
        target_id: randomUUID(),
      },
    });
    expect(res.statusCode).toBe(404);
  });
});
