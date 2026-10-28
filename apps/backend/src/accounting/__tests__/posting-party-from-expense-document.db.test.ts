/**
 * LEAD 443.112 #3 — real Postgres. An expense posting written with no entity (the pre-D6 shape of
 * EXP-2026-00001..00005) cannot be repointed (refuse_posting_fact_update), so readers attribute it to its expense's
 * payee (posting-party.sql.ts), the way 443.102 / #26579 attributes settlement A/P legs through their run.
 * Everything runs in ONE transaction that is rolled back.
 */
import pg from "pg";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { postBalancedSourceLine } from "../../../test-helpers/post-balanced-source-line.js";
import { postingPartyFromDocumentSql, postingPartyTypeSql, postingPartyUuidSql } from "../posting-party.sql.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("expense posting party from its document (443.112 #3, real Postgres)", () => {
  it("legacy NULL-entity expense posting reads its expense's vendor; stored entity wins; WORM refuses the fill; foreign doc never", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const tag = `TST${Date.now().toString(36).toUpperCase()}`;
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      const co = async (code: string) =>
        (await one(`INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
          [code, `443.112 party test ${code}`])).id;
      const opco = await co(`${tag}A`);
      const other = await co(`${tag}B`);
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const vendor = (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, 'TST 443.112 vendor', 'other') RETURNING id::text AS id`, [opco])).id;
      const account = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, 'TST 443.112 expense', 'Expense', '96912') RETURNING id::text AS id`, [opco])).id;
      const je = (await one(`INSERT INTO accounting.journal_entries (operating_company_id, entry_date, memo) VALUES ($1, CURRENT_DATE, 'TST 443.112') RETURNING id::text AS id`, [opco])).id;

      // Legacy shape: the posting is written while its expense does not exist yet, so the writer derives no entity.
      const legacyExpense = randomUUID();
      const legacyPosting = await postBalancedSourceLine(db as never, {
        operating_company_id: opco, journal_entry_uuid: je, line_sequence: 1, account_id: account, debit_or_credit: "debit",
        amount_cents: 500, description: "TST legacy expense leg", source_transaction_type: "expense", source_transaction_id: legacyExpense,
      } as never);
      await db.query(
        `INSERT INTO accounting.expenses (id, operating_company_id, vendor_uuid, transaction_date, total_amount_cents, status, posting_status, journal_entry_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, CURRENT_DATE, 500, 'posted', 'posted', $4::uuid)`,
        [legacyExpense, opco, vendor, je]
      );
      // Forward shape: the expense exists first, so the ONE writer stamps the vendor itself (D6).
      const fwdExpense = randomUUID();
      await db.query(
        `INSERT INTO accounting.expenses (id, operating_company_id, vendor_uuid, transaction_date, total_amount_cents, status, posting_status, journal_entry_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, CURRENT_DATE, 500, 'posted', 'posted', $4::uuid)`,
        [fwdExpense, opco, vendor, je]
      );
      const fwdPosting = await postBalancedSourceLine(db as never, {
        operating_company_id: opco, journal_entry_uuid: je, line_sequence: 2, account_id: account, debit_or_credit: "credit",
        amount_cents: 500, description: "TST forward expense leg", source_transaction_type: "expense", source_transaction_id: fwdExpense,
      } as never);
      // A document of ANOTHER company never attributes (same-company predicate).
      const foreignExpense = randomUUID();
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [other]);
      const foreignVendor = (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, 'TST 443.112 foreign vendor', 'other') RETURNING id::text AS id`, [other])).id;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const foreignPosting = await postBalancedSourceLine(db as never, {
        operating_company_id: opco, journal_entry_uuid: je, line_sequence: 3, account_id: account, debit_or_credit: "debit",
        amount_cents: 100, description: "TST foreign-doc leg", source_transaction_type: "expense", source_transaction_id: foreignExpense,
      } as never);
      await db.query(
        `INSERT INTO accounting.expenses (id, operating_company_id, vendor_uuid, transaction_date, total_amount_cents, status, posting_status)
         VALUES ($1::uuid, $2::uuid, $3::uuid, CURRENT_DATE, 0, 'draft', 'unposted')`,
        [foreignExpense, other, foreignVendor]
      );

      const read = async (id: string) =>
        (await db.query<{ stored: string | null; party: string | null; kind: string | null; from_doc: boolean }>(
          `SELECT p.entity_uuid::text AS stored, ${postingPartyUuidSql("p")} AS party, ${postingPartyTypeSql("p")} AS kind,
                  ${postingPartyFromDocumentSql("p")} AS from_doc
             FROM accounting.journal_entry_postings p WHERE p.id = $1::uuid`, [id])).rows[0]!;
      const idOf = (r: unknown) => (typeof r === "string" ? r : (r as { id: string }).id);

      const legacy = await read(idOf(legacyPosting));
      expect(legacy.stored).toBeNull();
      expect(legacy).toMatchObject({ party: vendor, kind: "vendor", from_doc: true });

      const fwd = await read(idOf(fwdPosting));
      expect(fwd).toMatchObject({ stored: vendor, party: vendor, kind: "vendor", from_doc: false });

      const foreign = await read(idOf(foreignPosting));
      expect(foreign).toMatchObject({ stored: null, party: null, kind: null, from_doc: false });

      // WORM stands: the legacy entity cannot be filled in place — that is WHY readers attribute through the document.
      await db.query("SAVEPOINT worm");
      await expect(
        db.query(`UPDATE accounting.journal_entry_postings SET entity_uuid = $2::uuid, entity_type = 'vendor' WHERE id = $1::uuid`, [idOf(legacyPosting), vendor])
      ).rejects.toThrow(/posting_fact_update_refused/);
      await db.query("ROLLBACK TO SAVEPOINT worm");
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      await db.end();
    }
  });
});
