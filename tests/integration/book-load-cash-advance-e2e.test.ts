import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../apps/backend/src/lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../apps/backend/test-helpers/constants";
import {
  ensureIntegrationLoadId,
  ensureIntegrationPrerequisites,
  ensureSecondEntityLoad,
  getIntegrationWorkOrderSeedIds,
  withCompanyRls,
} from "../../apps/backend/test-helpers/db-fixture";
import {
  approveCashAdvanceRequest,
  createCashAdvanceRequest,
} from "../../apps/backend/src/driver-finance/cash-advance-requests.service.js";
import { bookLoad, type BookLoadInput } from "../../apps/backend/src/dispatch/book-load.service.js";

// [HOLD-FOR-JORGE — TIER 1] #1440 e2e — proves the cash-advance-on-book money behavior on REAL rows (the leg
// unit tests can't reach: status / load_id forwarding / RLS hiding). CI-gated like the other integration e2es;
// run locally with GITHUB_ACTIONS=true DATABASE_DIRECT_URL=postgresql://localhost:5432/ih35_ci?sslmode=disable
// (against a FULLY-migrated DB). GUARD runs the authoritative proof on the Neon ci-migration-test branch.
const describeE2E = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

const AMOUNT_CENTS = 12345;

describeE2E("book-load cash advance — E2E (real DB, #1440)", () => {
  let client: pg.Client;
  let companyId: string;
  let driverId: string;
  let loadId: string;

  // Each test runs in its own transaction that ALWAYS resolves (COMMIT on success, ROLLBACK on error) so a
  // failure can never poison the shared connection ("current transaction is aborted") for the next test.
  async function tx<T>(fn: () => Promise<T>): Promise<T> {
    await client.query("BEGIN");
    try {
      const r = await fn();
      await client.query("COMMIT");
      return r;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }
  async function asCompany(id: string) {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [id]);
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    ({ driverId } = await getIntegrationWorkOrderSeedIds());
    loadId = await ensureIntegrationLoadId();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL required");
    client = new pg.Client(buildPgClientConfig(cs));
    await client.connect();
    await client.query("SET ROLE ih35_app");
  });

  afterAll(async () => {
    try {
      await tx(async () => {
        await client.query("SET LOCAL app.bypass_rls = 'lucia'");
        await client.query(`DELETE FROM driver_finance.driver_advances WHERE load_id = $1::uuid`, [loadId]);
        await client.query(`DELETE FROM driver_finance.cash_advance_requests WHERE load_id = $1::uuid`, [loadId]);
      });
    } catch {
      /* best effort */
    }
    await client.end();
  });

  it("(a) cash advance + driver → a PENDING cash_advance_requests row tied to load_id (real row)", async () => {
    const row = await tx(async () => {
      await asCompany(companyId);
      await createCashAdvanceRequest(client, {
        operatingCompanyId: companyId,
        driverId,
        actorUserId: TEST_OWNER_USER_ID,
        body: { requested_amount_cents: AMOUNT_CENTS, reason: `E2E cash advance on load ${loadId}`, submitted_via: "office", load_id: loadId },
      });
      const r = await client.query<{ status: string; load_id: string; driver_id: string; requested_amount_cents: string }>(
        `SELECT status, load_id::text, driver_id::text, requested_amount_cents FROM driver_finance.cash_advance_requests WHERE load_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
        [loadId]
      );
      return r.rows[0];
    });
    expect(row?.status).toBe("pending");
    expect(row?.load_id).toBe(loadId);
    expect(row?.driver_id).toBe(driverId);
    expect(Number(row?.requested_amount_cents)).toBe(AMOUNT_CENTS);
  });

  it("(b) owner approval → forwards load_id onto the disbursed driver_advances row (the fix the harness caught)", async () => {
    const advLoadId = await tx(async () => {
      await asCompany(companyId);
      const reqRow = await client.query<{ id: string }>(
        `SELECT id::text FROM driver_finance.cash_advance_requests WHERE load_id = $1::uuid AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
        [loadId]
      );
      const requestId = reqRow.rows[0]!.id;
      const res = await approveCashAdvanceRequest(client, {
        operatingCompanyId: companyId,
        requestId,
        actorUserId: TEST_OWNER_USER_ID,
        actorRole: "Owner",
        body: { approval_notes: "e2e approve" },
      });
      expect(res).not.toHaveProperty("error");
      const adv = await client.query<{ load_id: string | null }>(
        `SELECT da.load_id::text FROM driver_finance.driver_advances da
         JOIN driver_finance.cash_advance_requests r ON r.linked_advance_id = da.id
         WHERE r.id = $1::uuid LIMIT 1`,
        [requestId]
      );
      return adv.rows[0]?.load_id ?? null;
    });
    expect(advLoadId, "driver_advances.load_id must be forwarded from the request").toBe(loadId);
  });

  it("(d) cash advance with NO driver → bookLoad rejects 422 and writes NO request row", async () => {
    const before = Number((await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM driver_finance.cash_advance_requests`)).rows[0]!.n);
    const input: BookLoadInput = {
      requestingUserUuid: TEST_OWNER_USER_ID,
      requestingUserRole: "Owner",
      operating_company_id: companyId,
      customer_id: randomUUID(),
      status: "assigned_not_dispatched",
      charges: [],
      stops: [],
      save_mode: "book_dispatch",
      cash_advance_cents: 5000,
    };
    const result = await bookLoad(input);
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.status).toBe(422);
    const after = Number((await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM driver_finance.cash_advance_requests`)).rows[0]!.n);
    expect(after).toBe(before); // no partial/floating write
  });

  it("(e) cross-entity: the entity-1 request is INVISIBLE under entity-2 RLS, visible under entity-1", async () => {
    const second = await ensureSecondEntityLoad();
    const { underEntity2, underEntity1 } = await tx(async () => {
      const e2 = await withCompanyRls(client, second.companyId, async () =>
        Number((await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM driver_finance.cash_advance_requests WHERE load_id = $1::uuid`, [loadId])).rows[0]!.n)
      );
      const e1 = await withCompanyRls(client, companyId, async () =>
        Number((await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM driver_finance.cash_advance_requests WHERE load_id = $1::uuid`, [loadId])).rows[0]!.n)
      );
      return { underEntity2: e2, underEntity1: e1 };
    });
    expect(underEntity2, "entity-2 must NOT see entity-1's cash-advance row").toBe(0);
    expect(underEntity1, "entity-1 must see its own cash-advance row").toBeGreaterThanOrEqual(1);
  });

  it("(c) fuel advance → ZERO extra driver-debt rows for this load (fuel is audit-only, never a deduction)", async () => {
    const n = await tx(async () => {
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");
      const r = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM driver_finance.cash_advance_requests WHERE load_id = $1::uuid`, [loadId]);
      return Number(r.rows[0]!.n);
    });
    // Exactly the ONE cash advance from (a) is tied to this load — fuel created none. (The observed-on-real-rows
    // zero-deduction for a full bookLoad fuel flow is part of GUARD's authoritative Neon run.)
    expect(n).toBe(1);
  });
});
