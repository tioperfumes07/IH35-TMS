/**
 * BANK-F5330 / P23-BANKING-RAW-UUID-BACKEND-GAPS — migration 202612670000 added entity_type as the
 * discriminator beside accounting.journal_entry_postings.entity_uuid (previously an untyped raw
 * uuid, which is what forced ManualJEModal.tsx's field to be a raw-UUID <input>). Proves the create
 * route's zod pairing check (defense in depth ahead of the DB CHECK
 * journal_entry_postings_entity_pair_check) rejects a one-sided pair with a named 400, accepts a
 * matched pair, accepts neither being set, and that entity_type round-trips on read. Runs only in CI
 * (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerJournalEntryRoutes } from "../journal-entries.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("POST /api/v1/accounting/journal-entries entity_type pairing (real Postgres)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let companyId: string;
  let accountId: string;
  let creditAccountId: string;
  const suffix = randomUUID().slice(0, 8);

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

    await bypass(async () => {
      // accounts_active_requires_account_number: an active (non-deactivated) account must carry a
      // real account_number — these fixtures predate that constraint and never set one.
      const acctRes = await db.query<{ id: string }>(
        `INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number)
         VALUES ($1::uuid, $2, 'Expense', $3) RETURNING id`,
        [companyId, `ENTITY-TYPE-TEST-DEBIT ${suffix}`, `ETT-D-${suffix}`]
      );
      accountId = acctRes.rows[0]!.id;
      const creditRes = await db.query<{ id: string }>(
        `INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number)
         VALUES ($1::uuid, $2, 'Expense', $3) RETURNING id`,
        [companyId, `ENTITY-TYPE-TEST-CREDIT ${suffix}`, `ETT-C-${suffix}`]
      );
      creditAccountId = creditRes.rows[0]!.id;
    });

    app = await createIntegrationApp(async (a) => {
      await registerJournalEntryRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
    await db.end();
  });

  function twoLinePostings(overrides: Record<string, unknown>) {
    return [
      { account_id: accountId, debit_or_credit: "debit" as const, amount_cents: 5000, ...overrides },
      { account_id: creditAccountId, debit_or_credit: "credit" as const, amount_cents: 5000 },
    ];
  }

  it("rejects entity_uuid set without entity_type with a named 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/accounting/journal-entries",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        entry_date: new Date().toISOString().slice(0, 10),
        source: "manual",
        postings: twoLinePostings({ entity_uuid: randomUUID() }),
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects entity_type set without entity_uuid with a named 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/accounting/journal-entries",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        entry_date: new Date().toISOString().slice(0, 10),
        source: "manual",
        postings: twoLinePostings({ entity_type: "driver" }),
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts a matched entity_type + entity_uuid pair and round-trips entity_type on read", async () => {
    const entityUuid = randomUUID();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/accounting/journal-entries",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        entry_date: new Date().toISOString().slice(0, 10),
        source: "manual",
        postings: twoLinePostings({ entity_type: "driver", entity_uuid: entityUuid }),
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json() as { id: string };

    const getRes = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/journal-entries/${created.id}?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(getRes.statusCode).toBe(200);
    const body = getRes.json() as {
      postings: Array<{ entity_uuid: string | null; entity_type: string | null }>;
    };
    const line = body.postings.find((p) => p.entity_uuid === entityUuid);
    expect(line).toBeTruthy();
    expect(line!.entity_type).toBe("driver");
  });

  it("accepts neither entity_type nor entity_uuid set (both optional)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/accounting/journal-entries",
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {
        operating_company_id: companyId,
        entry_date: new Date().toISOString().slice(0, 10),
        source: "manual",
        postings: twoLinePostings({}),
      },
    });
    expect(res.statusCode).toBe(201);
  });
});
