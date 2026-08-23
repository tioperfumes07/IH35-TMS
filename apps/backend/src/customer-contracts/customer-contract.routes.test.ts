/**
 * Customer contract create/supersede — file_id company-scope regression guard (real Postgres)
 *
 * LIVE BUG (CUST-F5999): POST create validated an incoming file_id by existence/undeleted-state
 * ONLY (no company predicate), and POST supersede accepted file_id WITHOUT VALIDATING IT AT ALL.
 * Both mutation paths could therefore persist a cross-company docs.files reference onto
 * customer.contract.file_id — CUST-F5998 fixed the GET routes' joined-metadata disclosure but left
 * both writers unrepaired.
 *
 * This test seeds a customer + file at companyA (the caller's default) and a second file at
 * companyB (the caller's other real membership) and proves:
 *   1. POST create with the SAME-company file succeeds.
 *   2. POST create with the CROSS-company file 404s (file_not_found) — closes the create half.
 *   3. POST supersede with the SAME-company file succeeds.
 *   4. POST supersede with the CROSS-company file 404s — closes the supersede half, which
 *      previously had NO validation whatsoever.
 */

import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { testAuthHeaders } from "../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites, ensureSecondEntityLoad } from "../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../test-helpers/http-app.js";
import { registerCustomerContractRoutes } from "./customer-contract.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("customer contract create/supersede — file_id company scope (CUST-F5999, real Postgres)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let companyA: string;
  let companyB: string;
  let customerAId: string;
  let fileAId: string;
  let fileBId: string;
  let contractId: string;
  const suffix = randomUUID().slice(0, 8);

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
        [`CUST-F5999 companyA customer ${suffix}`, companyA]
      );
      customerAId = cust.rows[0]!.id;

      const fileA = await db.query<{ id: string }>(
        `INSERT INTO docs.files (operating_company_id, original_filename, mime_type, size_bytes, r2_key, uploader_user_id)
         VALUES ($1::uuid, 'companyA-contract.pdf', 'application/pdf', 100, $2, $3::uuid)
         RETURNING id`,
        [companyA, `cust-f5999-a-${suffix}`, TEST_OWNER_USER_ID]
      );
      fileAId = fileA.rows[0]!.id;

      const fileB = await db.query<{ id: string }>(
        `INSERT INTO docs.files (operating_company_id, original_filename, mime_type, size_bytes, r2_key, uploader_user_id)
         VALUES ($1::uuid, 'companyB-contract.pdf', 'application/pdf', 100, $2, $3::uuid)
         RETURNING id`,
        [companyB, `cust-f5999-b-${suffix}`, TEST_OWNER_USER_ID]
      );
      fileBId = fileB.rows[0]!.id;
    });

    app = await createIntegrationApp(async (a) => {
      await registerCustomerContractRoutes(a);
    });
  });

  afterAll(async () => {
    await app?.close().catch(() => {});
    if (db) {
      await withBypass(async () => {
        await db.query(`DELETE FROM customer.contract WHERE customer_id = $1::uuid`, [customerAId]);
        await db.query(`DELETE FROM docs.files WHERE id = ANY($1::uuid[])`, [[fileAId, fileBId]]);
        await db.query(`DELETE FROM mdata.customers WHERE id = $1::uuid`, [customerAId]);
      }).catch(() => {});
      await db.end().catch(() => {});
    }
  });

  it("POST create 404s a CROSS-company file_id (was: unscoped existence check only)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/customer-contracts",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyA,
        customer_id: customerAId,
        file_id: fileBId,
        contract_type: "rate_agreement",
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "file_not_found" });
  });

  it("POST create succeeds with the SAME-company file_id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/customer-contracts",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyA,
        customer_id: customerAId,
        file_id: fileAId,
        contract_type: "rate_agreement",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id?: string };
    expect(body.id).toBeTruthy();
    contractId = body.id!;
  });

  it("POST supersede 404s a CROSS-company file_id (was: NO validation at all)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/customer-contracts/${contractId}/supersede`,
      headers: testAuthHeaders(undefined, "Owner"),
      payload: { operating_company_id: companyA, file_id: fileBId },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "file_not_found" });
  });

  it("POST supersede succeeds with the SAME-company file_id", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/customer-contracts/${contractId}/supersede`,
      headers: testAuthHeaders(undefined, "Owner"),
      payload: { operating_company_id: companyA, file_id: fileAId },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id?: string; superseded_id?: string };
    expect(body.id).toBeTruthy();
    expect(body.superseded_id).toBe(contractId);
  });
});

describe("customer contract routes (always-on smoke)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createIntegrationApp(async (a) => {
      await registerCustomerContractRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /api/v1/customer-contracts rejects unauthenticated callers", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/customer-contracts",
      payload: { operating_company_id: randomUUID(), customer_id: randomUUID() },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST supersede does not 500 for an unknown contract without DB fixtures", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/customer-contracts/${randomUUID()}/supersede`,
      headers: testAuthHeaders(undefined, "Owner"),
      payload: { operating_company_id: randomUUID() },
    });
    // A RANDOM operating_company_id is not a real membership, so setScopedCompanyContext rejects it
    // (403) before ever touching the contract table — never a 500.
    expect(res.statusCode).toBe(403);
  });
});
