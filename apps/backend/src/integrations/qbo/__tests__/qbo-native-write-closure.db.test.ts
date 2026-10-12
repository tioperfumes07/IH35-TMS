/**
 * ACCT-F4431381 (Lead 443.137 item 9e, part 2) — QuickBooks is a READ-ONLY ARCHIVE (real Postgres).
 *
 * Proves, against a migrated database, that the last QuickBooks -> native writers part 1 found now write
 * nothing native:
 *   1. qbo-vendor-linkage createDriverWithQboVendor refuses by name and leaves NO mdata.drivers row.
 *   2. qbo-vendor-linkage linkClass refuses by name and leaves the unit's qbo_class_id unchanged.
 *   3. qbo-vendor-linkage unlinkVendor refuses by name and leaves the driver's qbo_vendor_id unchanged.
 *   4. The vendor-linkage write route answers 409 QBO_NATIVE_WRITE_REFUSED (never a 500, never a write).
 *   5. The carrier bootstrap copies NO QuickBooks chart rows into the new carrier's mdata.qbo_accounts
 *      and names the refusal (coa_refused) — while the template carrier HAS chart rows to copy.
 *
 * Fail-old: on the pre-fix code, (1) resolves and inserts a driver, (2) commits the class id, (3) nulls
 * the vendor id, (4) returns 200, and (5) clones the template chart (cloned rows > 0).
 *
 * Fixtures: the unit/driver fixtures are the migration-seeded TRANSP integration rows; any value this
 * test could change is captured first and restored in afterAll (superuser), so a failing old-code run
 * cannot leave drift. The bootstrap case runs inside one transaction that is always ROLLED BACK, on two
 * isolated (non-TRANSP/TRK/USMCA) companies that are deactivated afterwards.
 *
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  getIntegrationWorkOrderSeedIds,
  type IsolatedOperatingCompany,
} from "../../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../../test-helpers/constants.js";
import { captureRoutes } from "../../../../test-helpers/capture-route-handler.js";
import { QBO_NATIVE_WRITE_REFUSED } from "../../../qbo-sync/qbo-native-write-refused.js";
import { createDriverWithQboVendor, linkClass, unlinkVendor } from "../qbo-vendor-linkage.service.js";
import { registerQboVendorLinkageRoutes } from "../qbo-vendor-linkage.routes.js";
import { bootstrapCarrier } from "../../../onboarding/usmca-carrier-bootstrap.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "RESOLVED";
  } catch (error) {
    return String((error as { code?: unknown }).code ?? (error as Error).message);
  }
}

describeIntegration("443.137 9e part 2 — QBO paths write no native table (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  let unitId: string;
  let driverId: string;
  let originalUnitClassId: string | null = null;
  let originalDriverVendor: { qbo_vendor_id: string | null; qbo_vendor_linked_at: string | null } | null = null;
  const tag = randomUUID().slice(0, 8);
  const fixtureVendorId = `QBOVEND-9E2-${tag}`;
  const isolated: IsolatedOperatingCompany[] = [];

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    ({ unitId, driverId } = await getIntegrationWorkOrderSeedIds());
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    const u = await db.query<{ qbo_class_id: string | null }>(`SELECT qbo_class_id FROM mdata.units WHERE id = $1::uuid`, [unitId]);
    originalUnitClassId = u.rows[0]?.qbo_class_id ?? null;
    const d = await db.query<{ qbo_vendor_id: string | null; qbo_vendor_linked_at: string | null }>(
      `SELECT qbo_vendor_id, qbo_vendor_linked_at::text FROM mdata.drivers WHERE id = $1::uuid`,
      [driverId]
    );
    originalDriverVendor = d.rows[0] ?? null;
    // Give the driver a linked QBO vendor id so an unlink has something to (wrongly) clear.
    await db.query(`UPDATE mdata.drivers SET qbo_vendor_id = $2, qbo_vendor_linked_at = now() WHERE id = $1::uuid`, [driverId, fixtureVendorId]);
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(`DELETE FROM mdata.drivers WHERE first_name = $1`, [`QBO9E2-${tag}`]).catch(() => {});
    await db.query(`UPDATE mdata.units SET qbo_class_id = $2 WHERE id = $1::uuid`, [unitId, originalUnitClassId]).catch(() => {});
    if (originalDriverVendor) {
      await db
        .query(`UPDATE mdata.drivers SET qbo_vendor_id = $2, qbo_vendor_linked_at = $3::timestamptz WHERE id = $1::uuid`, [
          driverId,
          originalDriverVendor.qbo_vendor_id,
          originalDriverVendor.qbo_vendor_linked_at,
        ])
        .catch(() => {});
    }
    for (const c of isolated) await deactivateIsolatedOperatingCompany(db, c).catch(() => {});
    await db.end();
  });

  it("createDriverWithQboVendor refuses by name and inserts no mdata.drivers row", async () => {
    const code = await codeOf(
      createDriverWithQboVendor(TEST_OWNER_USER_ID, {
        operatingCompanyId: companyId,
        firstName: `QBO9E2-${tag}`,
        lastName: "Refused",
        phone: "5550000000",
        qboVendorName: `QBO9E2 ${tag}`,
      })
    );
    expect(code).toBe(QBO_NATIVE_WRITE_REFUSED);
    const rows = await db.query(`SELECT 1 FROM mdata.drivers WHERE first_name = $1`, [`QBO9E2-${tag}`]);
    expect(rows.rowCount).toBe(0);
  });

  it("linkClass refuses by name and leaves the unit's qbo_class_id unchanged", async () => {
    const code = await codeOf(
      linkClass(TEST_OWNER_USER_ID, {
        operatingCompanyId: companyId,
        entityType: "unit",
        entityId: unitId,
        qboClassId: `QBOCLASS-9E2-${tag}`,
        reason: "9e part 2 fail-old proof",
        force: true,
      })
    );
    expect(code).toBe(QBO_NATIVE_WRITE_REFUSED);
    const u = await db.query<{ qbo_class_id: string | null }>(`SELECT qbo_class_id FROM mdata.units WHERE id = $1::uuid`, [unitId]);
    expect(u.rows[0]?.qbo_class_id ?? null).toBe(originalUnitClassId);
  });

  it("unlinkVendor refuses by name and leaves the driver's qbo_vendor_id unchanged", async () => {
    const code = await codeOf(
      unlinkVendor(TEST_OWNER_USER_ID, {
        operatingCompanyId: companyId,
        entityType: "driver",
        entityId: driverId,
        reason: "9e part 2 fail-old proof",
      })
    );
    expect(code).toBe(QBO_NATIVE_WRITE_REFUSED);
    const d = await db.query<{ qbo_vendor_id: string | null }>(`SELECT qbo_vendor_id FROM mdata.drivers WHERE id = $1::uuid`, [driverId]);
    expect(d.rows[0]?.qbo_vendor_id).toBe(fixtureVendorId);
  });

  it("POST /api/v1/master-data/units/:id/link-qbo-class answers 409 QBO_NATIVE_WRITE_REFUSED", async () => {
    const cap = captureRoutes();
    await registerQboVendorLinkageRoutes(cap.app);
    const handler = cap.handlerFor("/api/v1/master-data/units/:id/link-qbo-class", "post");
    let status = 200;
    let body: unknown = null;
    const reply = {
      code(c: number) {
        status = c;
        return reply;
      },
      send(b: unknown) {
        body = b;
        return reply;
      },
    };
    const out = await handler(
      {
        user: { uuid: TEST_OWNER_USER_ID, role: "Owner" },
        session: { id: "test-session" },
        params: { id: unitId },
        body: { operating_company_id: companyId, qbo_class_id: `QBOCLASS-9E2R-${tag}`, reason: "9e part 2 route proof", force: true },
      },
      reply
    );
    if (out && out !== reply) body = out;
    expect(status).toBe(409);
    expect((body as { error?: string } | null)?.error).toBe(QBO_NATIVE_WRITE_REFUSED);
    const u = await db.query<{ qbo_class_id: string | null }>(`SELECT qbo_class_id FROM mdata.units WHERE id = $1::uuid`, [unitId]);
    expect(u.rows[0]?.qbo_class_id ?? null).toBe(originalUnitClassId);
  });

  it("bootstrapCarrier copies no QuickBooks chart rows into the new carrier and names the refusal", async () => {
    const template = await createIsolatedOperatingCompany({ codePrefix: "Q9T", label: "9e2 template" });
    const target = await createIsolatedOperatingCompany({ codePrefix: "Q9N", label: "9e2 target" });
    isolated.push(template, target);
    await db.query("BEGIN");
    try {
      // The template carrier HAS a QuickBooks chart row, so the old clone had something to copy.
      await db.query(
        `INSERT INTO mdata.qbo_accounts (operating_company_id, qbo_id, name, account_type, active, payload_json)
         VALUES ($1::uuid, $2, $3, 'Expense', true, '{}'::jsonb)`,
        [template.companyId, `QBOACCT-9E2-${tag}`, `9E2 Template Expense ${tag}`]
      );
      const result = (await bootstrapCarrier(db, template.companyId, target.companyId, TEST_OWNER_USER_ID)) as {
        coa_cloned: number;
        coa_refused?: { code: string };
      };
      const cloned = await db.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM mdata.qbo_accounts WHERE operating_company_id = $1::uuid`,
        [target.companyId]
      );
      expect(cloned.rows[0]?.c).toBe(0);
      expect(result.coa_cloned).toBe(0);
      expect(result.coa_refused?.code).toBe(QBO_NATIVE_WRITE_REFUSED);
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
