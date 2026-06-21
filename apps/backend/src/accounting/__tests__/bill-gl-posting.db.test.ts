/**
 * CHAIN-03 STEP-2 — bill → GL posting END-TO-END (real Postgres).
 * Proves buildBillLines (via the SHARED resolveBillLineDebitAccount) through postSourceTransaction:
 *   - a TRANSP bill with a mapped FUEL line + a no-category line posts a BALANCED JE:
 *       DR fuel account · DR uncategorized_expense (QBO-25) · single CR to ap_control. SUM(dr)=SUM(cr).
 *   - a line with a category that has NO map entry → FAIL LOUD (CATEGORY_MAPPING_MISSING), nothing posts.
 * This is the literal posted-JE proof GUARD asked for, produced by the real writer against CI Postgres
 * (no prod access needed). The actual JE rows are console.logged for the CI artifact.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { postSourceTransaction, PostingEngineError } from "../posting-engine.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("bill → GL posting end-to-end (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 6);
  const fuelAccountId = randomUUID();
  const uncatAccountId = randomUUID();
  const apAccountId = randomUUID();
  const userId = "00000000-0000-4000-8000-0000000000bb";
  const createdBillIds: string[] = [];

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    try { await fn(); await db.query("COMMIT"); }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  async function scopedRead<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    try { const r = await db.query(sql, params); await db.query("COMMIT"); return r.rows as T[]; }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await bypass(async () => {
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [userId, `bill-gl-${suffix}@test.local`]
      );
      // posting CoA: a fuel expense, the uncategorized (QBO-25) expense, and A/P.
      await db.query(`INSERT INTO catalogs.accounts (id, account_number, account_name, account_type, is_postable) VALUES ($1::uuid,$2,'Fuel Test','Expense',true)`, [fuelAccountId, `F${suffix}`]);
      await db.query(`INSERT INTO catalogs.accounts (id, account_number, account_name, account_type, is_postable) VALUES ($1::uuid,$2,'Uncat Test','Expense',true)`, [uncatAccountId, `U${suffix}`]);
      await db.query(`INSERT INTO catalogs.accounts (id, account_number, account_name, account_type, is_postable) VALUES ($1::uuid,$2,'AP Test','Liability',true)`, [apAccountId, `P${suffix}`]);
      // roles: ap_control (CR side) + uncategorized_expense (no-category DR fallback).
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid,'ap_control',$2::uuid,true)
         ON CONFLICT (operating_company_id, role) WHERE is_active = true DO NOTHING`,
        [companyId, apAccountId]
      );
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid,'uncategorized_expense',$2::uuid,true)
         ON CONFLICT (operating_company_id, role) WHERE is_active = true DO NOTHING`,
        [companyId, uncatAccountId]
      );
      // expense_category_account_map: (fuel, FUEL) → fuel account.
      await db.query(
        `INSERT INTO accounting.expense_category_account_map (operating_company_id, category_kind, category_code, account_id, posting_side, is_active)
         VALUES ($1::uuid,'fuel','FUEL',$2::uuid,'debit',true)`,
        [companyId, fuelAccountId]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(`DELETE FROM accounting.journal_entry_postings WHERE source_transaction_id = ANY($1) AND source_transaction_type='bill'`, [createdBillIds]);
        await db.query(`DELETE FROM accounting.posting_batches WHERE source_transaction_id = ANY($1) AND source_transaction_type='bill'`, [createdBillIds]);
        await db.query(`DELETE FROM accounting.bill_lines WHERE bill_id = ANY($1::uuid[])`, [createdBillIds]);
        await db.query(`DELETE FROM accounting.bills WHERE id = ANY($1::uuid[])`, [createdBillIds]);
        await db.query(`DELETE FROM accounting.expense_category_account_map WHERE operating_company_id=$1::uuid AND account_id=$2::uuid`, [companyId, fuelAccountId]);
        await db.query(`DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id=$1::uuid AND account_id = ANY($2::uuid[])`, [companyId, [apAccountId, uncatAccountId]]);
      });
    } catch { /* best-effort cleanup */ }
    await db.end();
  });

  type LineSpec = { amount_cents: number; category_kind?: string | null; category_code?: string | null };
  async function seedBill(lines: LineSpec[]): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      const total = lines.reduce((a, b) => a + b.amount_cents, 0);
      await db.query(
        `INSERT INTO accounting.bills (id, operating_company_id, bill_date, status, amount_cents, total_amount, bill_number)
         VALUES ($1::uuid,$2::uuid,CURRENT_DATE,'unpaid',$3,$4,$5)`,
        [id, companyId, total, total / 100, `BILL-${suffix}-${createdBillIds.length + 1}`]
      );
      let seq = 1;
      for (const l of lines) {
        await db.query(
          `INSERT INTO accounting.bill_lines (bill_id, line_sequence, amount, description, category_kind, category_code)
           VALUES ($1::uuid,$2,$3,$4,$5,$6)`,
          [id, seq++, l.amount_cents / 100, "line", l.category_kind ?? null, l.category_code ?? null]
        );
      }
    });
    createdBillIds.push(id);
    return id;
  }

  it("posts a BALANCED JE: DR fuel + DR uncategorized (QBO-25), single CR to A/P", async () => {
    const id = await seedBill([
      { amount_cents: 50_000, category_kind: "fuel", category_code: "FUEL" },
      { amount_cents: 13_000 }, // no category → uncategorized (QBO-25)
    ]);
    const result = await postSourceTransaction(
      { operating_company_id: companyId, source_transaction_type: "bill", source_transaction_id: id },
      { userId }
    );
    expect(result.journal_entry_id).toBeTruthy();

    const rows = await scopedRead<{ account_id: string; account_number: string; account_name: string; debit_or_credit: string; amount_cents: string }>(
      `SELECT p.account_id::text AS account_id, a.account_number, a.account_name, p.debit_or_credit, p.amount_cents::text AS amount_cents
         FROM accounting.journal_entry_postings p
         JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE p.journal_entry_uuid = $1::uuid
        ORDER BY p.debit_or_credit DESC, p.line_sequence ASC`,
      [result.journal_entry_id]
    );
    // CI ARTIFACT — the literal posted JE GUARD asked for.
    // eslint-disable-next-line no-console
    console.log("CHAIN-03 STEP-2 posted JE:\n" + rows.map((r) => `  ${r.debit_or_credit.toUpperCase().padEnd(6)} ${r.account_number} ${r.account_name}  $${(Number(r.amount_cents) / 100).toFixed(2)}`).join("\n"));

    // Resolve the LIVE role accounts (the verify-DB company may already have uncategorized_expense /
    // ap_control mapped from the seed migrations — assert against what the roles actually point to, not
    // the ids we tried to seed). Fuel is asserted by our own map row (no pre-existing fuel/FUEL).
    const liveRole = async (role: string): Promise<string> => {
      const r = await scopedRead<{ account_id: string }>(
        `SELECT account_id::text AS account_id FROM accounting.chart_of_accounts_roles
          WHERE operating_company_id=$1::uuid AND role=$2 AND is_active=true ORDER BY updated_at DESC LIMIT 1`,
        [companyId, role]
      );
      const id = r[0]?.account_id;
      if (!id) throw new Error(`no mapped ${role} role for company ${companyId}`);
      return id;
    };
    const liveUncat = await liveRole("uncategorized_expense");
    const liveAp = await liveRole("ap_control");

    const debits = rows.filter((r) => r.debit_or_credit === "debit");
    const credits = rows.filter((r) => r.debit_or_credit === "credit");
    const drBy = (id: string) => debits.filter((r) => r.account_id === id).reduce((s, r) => s + Number(r.amount_cents), 0);

    expect(drBy(fuelAccountId)).toBe(50_000);   // DR fuel (our expense_category_account_map row)
    expect(drBy(liveUncat)).toBe(13_000);       // DR uncategorized (QBO-25), via the live role
    expect(credits).toHaveLength(1);            // single summed CR to A/P
    expect(Number(credits[0].amount_cents)).toBe(63_000);
    expect(credits[0].account_id).toBe(liveAp); // CR to the live ap_control account
    const totalDr = debits.reduce((s, r) => s + Number(r.amount_cents), 0);
    const totalCr = credits.reduce((s, r) => s + Number(r.amount_cents), 0);
    expect(totalDr).toBe(totalCr); // balanced
    expect(totalDr).toBe(63_000);
  });

  it("a category with NO map entry → FAIL LOUD (CATEGORY_MAPPING_MISSING), nothing posts", async () => {
    const id = await seedBill([{ amount_cents: 100, category_kind: "fuel", category_code: "BOGUS" }]);
    let caught: unknown = null;
    try {
      await postSourceTransaction(
        { operating_company_id: companyId, source_transaction_type: "bill", source_transaction_id: id },
        { userId }
      );
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(PostingEngineError);
    expect(String((caught as Error)?.message ?? "")).toMatch(/CATEGORY_MAPPING_MISSING/);
    const posted = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entry_postings WHERE source_transaction_id = $1 AND source_transaction_type='bill'`,
      [id]
    );
    expect(Number(posted[0].c)).toBe(0); // nothing posted
  });
});
