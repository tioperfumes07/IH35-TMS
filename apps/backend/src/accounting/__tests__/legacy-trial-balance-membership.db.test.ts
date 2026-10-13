/**
 * I-01 (443.113, Codex deep-wiring audit): the mounted legacy GET /api/v1/accounting/reports/trial-balance summed every
 * posting with no ledger-membership rule, so a sample-data entry and a voided entry counted on it while every statement
 * left them out. The endpoint now runs THE trial-balance query (queryTrialBalanceRows). Proven on real Postgres through
 * the route itself: on an isolated company with one real, one sample-data and one voided entry, the endpoint shows only
 * the real one and returns the same rows as the canonical service.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { writeTransactionSourceLink } from "../accounting-spine-emit.js";
import { createIsolatedOperatingCompany } from "../../../test-helpers/isolated-company.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { refuseProductionConnectionString } from "../../../test-helpers/refuse-production.js";
import { registerAccountingP7Wave2Routes } from "../p7-wave2.routes.js";
import { getTrialBalanceReport } from "../trial-balance.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("I-01 legacy trial-balance endpoint = canonical ledger membership (real Postgres)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let companyId: string;
  let debitAcct: string;
  let creditAcct: string;

  async function entry(cents: number, opts: { sample?: boolean; voided?: boolean }) {
    const jeId = randomUUID();
    await db.query(
      `INSERT INTO accounting.journal_entries (id, operating_company_id, entry_date, memo, source, created_by_user_id, status, is_sample_data)
       VALUES ($1::uuid, $2::uuid, CURRENT_DATE, $3, 'manual', $4::uuid, $5, $6)`,
      [jeId, companyId, `I-01 ${cents}`, TEST_OWNER_USER_ID, opts.voided ? "voided" : "posted", opts.sample === true]
    );
    let seq = 0;
    for (const [acct, side] of [[debitAcct, "debit"], [creditAcct, "credit"]] as const) {
      const line = randomUUID();
      seq += 1;
      await db.query(
        `INSERT INTO accounting.journal_entry_postings
           (id, operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit, amount_cents, source_transaction_type, source_transaction_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6, $7, 'manual_je', $3::text)`,
        [line, companyId, jeId, seq, acct, side, cents]
      );
      await writeTransactionSourceLink(db, { operating_company_id: companyId, journal_entry_posting_id: line,
        linked_object_type: "journal_entry", linked_object_id: jeId, relationship_role: "manual_entry" });
    }
  }

  beforeAll(async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    companyId = (await createIsolatedOperatingCompany({ label: "i01-tb", codePrefix: "I01" })).companyId;
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    const acct = async (name: string, num: string) =>
      (await db.query<{ id: string }>(
        `INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1::uuid, $2, 'Expense', $3) RETURNING id::text AS id`,
        [companyId, name, num]
      )).rows[0]!.id;
    const tag = randomUUID().slice(0, 6);
    debitAcct = await acct(`I01 debit ${tag}`, `I01D${tag}`);
    creditAcct = await acct(`I01 credit ${tag}`, `I01C${tag}`);
    await entry(100_000, {});
    await entry(30_000, { sample: true });
    await entry(5_000, { voided: true });
    await db.query("COMMIT");
    app = await createIntegrationApp(async (a) => {
      await registerAccountingP7Wave2Routes(a);
    });
  });

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  it("counts only the real entry — sample-data and voided entries are left out, exactly like the canonical TB", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/reports/trial-balance?operating_company_id=${companyId}`,
      headers: testAuthHeaders(TEST_OWNER_USER_ID, "Owner"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { accounts: Array<{ account_id: string; debit_cents: number | string; credit_cents: number | string }> };
    const d = body.accounts.find((a) => a.account_id === debitAcct);
    const c = body.accounts.find((a) => a.account_id === creditAcct);
    expect(Number(d?.debit_cents)).toBe(100_000);
    expect(Number(c?.credit_cents)).toBe(100_000);

    const canonical = await getTrialBalanceReport({ userId: TEST_OWNER_USER_ID, operating_company_id: companyId });
    const legacy = body.accounts.map((a) => [a.account_id, Number(a.debit_cents), Number(a.credit_cents)]);
    expect(legacy).toEqual(canonical.rows.map((r) => [r.account_id, r.total_debits, r.total_credits]));
  });
});
