/**
 * Reverse drill-through: GET /api/v1/accounting/journal-entries/:id/source-links — "what posted this JE".
 * Proves it returns source-link rows scoped to the requested JE's postings (both mechanisms: the
 * accounting.transaction_source_links table AND journal_entry_postings.source_transaction_type/id
 * columns — see getJournalEntrySourceLinks in journal-entries.service.ts) and stays empty for an
 * unrelated JE with no source links. Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres
 * is available.
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

describeIntegration("GET /api/v1/accounting/journal-entries/:id/source-links (real Postgres)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  let jeWithLinks: string;
  let jeWithoutLinks: string;
  let sourceBillId: string;

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
      // real account_number — this fixture predates that constraint and never set one.
      const acctRes = await db.query<{ id: string }>(
        `INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number)
         VALUES ($1::uuid, $2, 'Expense', $3) RETURNING id`,
        [companyId, `SRC-LINK-TEST ${suffix}`, `SLT-${suffix}`]
      );
      const accountId = acctRes.rows[0]!.id;

      sourceBillId = randomUUID();

      const jeRes = await db.query<{ id: string }>(
        `INSERT INTO accounting.journal_entries (operating_company_id, entry_date, memo, status, source)
         VALUES ($1::uuid, CURRENT_DATE, 'source-link test', 'posted', 'auto')
         RETURNING id`,
        [companyId]
      );
      jeWithLinks = jeRes.rows[0]!.id;

      const postingRes = await db.query<{ id: string }>(
        `INSERT INTO accounting.journal_entry_postings
           (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit, amount_cents,
            source_transaction_type, source_transaction_id)
         VALUES ($1::uuid, $2::uuid, 1, $3::uuid, 'debit', 5000, 'bill', $4)
         RETURNING id`,
        [companyId, jeWithLinks, accountId, sourceBillId]
      );
      const postingId = postingRes.rows[0]!.id;
      // Balancing credit line (accounting.ensure_journal_entry_balanced trigger requires debits=credits
      // on the same journal_entry_uuid) — not itself under test, just satisfies the DB invariant.
      await db.query(
        `INSERT INTO accounting.journal_entry_postings
           (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit, amount_cents)
         VALUES ($1::uuid, $2::uuid, 2, $3::uuid, 'credit', 5000)`,
        [companyId, jeWithLinks, accountId]
      );

      await db.query(
        `INSERT INTO accounting.transaction_source_links
           (operating_company_id, journal_entry_posting_id, linked_object_type, linked_object_id, relationship_role)
         VALUES ($1::uuid, $2::uuid, 'bill', $3, 'test_source')`,
        [companyId, postingId, sourceBillId]
      );

      const jeNoLinksRes = await db.query<{ id: string }>(
        `INSERT INTO accounting.journal_entries (operating_company_id, entry_date, memo, status, source)
         VALUES ($1::uuid, CURRENT_DATE, 'no source-link test', 'posted', 'manual')
         RETURNING id`,
        [companyId]
      );
      jeWithoutLinks = jeNoLinksRes.rows[0]!.id;
      await db.query(
        `INSERT INTO accounting.journal_entry_postings
           (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit, amount_cents)
         VALUES ($1::uuid, $2::uuid, 1, $3::uuid, 'credit', 5000)`,
        [companyId, jeWithoutLinks, accountId]
      );
      await db.query(
        `INSERT INTO accounting.journal_entry_postings
           (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit, amount_cents)
         VALUES ($1::uuid, $2::uuid, 2, $3::uuid, 'debit', 5000)`,
        [companyId, jeWithoutLinks, accountId]
      );
    });

    app = await createIntegrationApp(async (a) => {
      await registerJournalEntryRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
    await db.end();
  });

  it("returns the source link + posting-column source for its own JE", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/journal-entries/${jeWithLinks}/source-links?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      journal_entry_id: string;
      source_links: Array<{
        source_transaction_type: string | null;
        source_transaction_id: string | null;
        linked_object_type: string | null;
        linked_object_id: string | null;
      }>;
    };
    expect(body.journal_entry_id).toBe(jeWithLinks);
    expect(body.source_links.length).toBeGreaterThan(0);
    const row = body.source_links[0]!;
    expect(row.source_transaction_type).toBe("bill");
    expect(row.source_transaction_id).toBe(sourceBillId);
    expect(row.linked_object_type).toBe("bill");
    expect(row.linked_object_id).toBe(sourceBillId);
  });

  it("returns no source links for a JE that has none", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/journal-entries/${jeWithoutLinks}/source-links?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      source_links: Array<{ source_transaction_type: string | null; linked_object_type: string | null }>;
    };
    // The posting line itself still returns (LEFT JOIN), but with no source markers.
    expect(body.source_links.every((r) => r.source_transaction_type === null && r.linked_object_type === null)).toBe(true);
  });

  it("404s for an unknown journal entry id", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/journal-entries/${randomUUID()}/source-links?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(res.statusCode).toBe(404);
  });
});
