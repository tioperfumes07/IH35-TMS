/**
 * 443.101 posting-gate PROOF — factor.faro_daily_imports (docs/specs/scoreboard/posting-gate-tables.json).
 *
 * Drives the ONE app writer of the table, upsertFaroDailyImportOnClient (data-infra.service.ts), on an isolated
 * company inside the app's own scoped transaction, asserts the import row + its invoice line + its totals, and rolls
 * everything back. Never seeds USMCA (owner laws 2026-09-02 / 2026-10-04).
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { upsertFaroDailyImportOnClient } from "../../data-infra/data-infra.service.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import {
  createIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { connectFixtureClient, inRolledBackAppTxn } from "../../../test-helpers/posting-gate-proof.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("posting-gate proof — factor.faro_daily_imports via upsertFaroDailyImportOnClient", () => {
  let db: pg.Client;
  let iso: IsolatedOperatingCompany;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = await connectFixtureClient();
    iso = await createIsolatedOperatingCompany({ codePrefix: "PGF", legalNamePrefix: "Posting-gate Faro import" });
  });

  afterAll(async () => {
    await db?.end();
  });

  it("writes the daily import (company, totals, raw payload) and its invoice line, then rolls back", async () => {
    const reference = `PG-FARO-${randomUUID().slice(0, 8)}`;
    const proof = await inRolledBackAppTxn(TEST_OWNER_USER_ID, iso.companyId, async (client) => {
      const out = await upsertFaroDailyImportOnClient(client as never, TEST_OWNER_USER_ID, {
        operatingCompanyId: iso.companyId,
        statementDate: "2026-10-01",
        statementReference: reference,
        sourceFilename: "posting-gate-proof.csv",
        lines: [
          {
            invoice_number: `INV-PG-${reference}`,
            customer_name: "Posting-gate customer",
            gross_amount_cents: 100_000,
            advance_amount_cents: 97_000,
            reserve_amount_cents: 0,
            fee_amount_cents: 1_500,
            chargeback_amount_cents: 0,
            net_amount_cents: 95_500,
          },
        ],
      });
      const row = (
        await client.query(
          `SELECT operating_company_id::text AS company, statement_reference, gross_total_cents::bigint AS gross,
                  advance_total_cents::bigint AS advance, fee_total_cents::bigint AS fee, imported_by_user_id::text AS by,
                  jsonb_array_length(raw_payload->'lines') AS payload_lines
             FROM factor.faro_daily_imports WHERE id = $1::uuid`,
          [out.id]
        )
      ).rows[0];
      const lines = (
        await client.query(
          `SELECT operating_company_id::text AS company, invoice_number, gross_amount_cents::bigint AS gross
             FROM factor.faro_invoice_lines WHERE daily_import_id = $1::uuid AND superseded_at IS NULL`,
          [out.id]
        )
      ).rows;
      return { id: out.id, row, lines };
    });

    expect(proof.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(proof.row).toMatchObject({
      company: iso.companyId,
      statement_reference: reference,
      by: TEST_OWNER_USER_ID,
      payload_lines: 1,
    });
    expect(Number(proof.row.gross)).toBe(100_000);
    expect(Number(proof.row.advance)).toBe(97_000);
    expect(Number(proof.row.fee)).toBe(1_500);
    expect(proof.lines).toHaveLength(1);
    expect(proof.lines[0]).toMatchObject({ company: iso.companyId, invoice_number: `INV-PG-${reference}` });

    // Rolled back: the gated table keeps no proof row.
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    const left = await db.query(`SELECT count(*)::int AS n FROM factor.faro_daily_imports WHERE id = $1::uuid`, [proof.id]);
    await db.query("COMMIT");
    expect(left.rows[0].n).toBe(0);
  });
});
