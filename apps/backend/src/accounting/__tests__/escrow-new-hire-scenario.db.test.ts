/**
 * STAGE-3 SCENARIO 4 — NEW-HIRE DRIVER ESCROW, real engine, real Postgres.
 *
 * The new-hire hop: money withheld from a driver and HELD IN TRUST is a LIABILITY of the company, not
 * revenue and not a reduction of expense. Proves:
 *   1. opening a driver escrow account binds it to the escrow_liability_default role account, and that
 *      account is of type Liability — asserted, not assumed. On prod USMCA this is literally
 *      2100 "Driver Escrow - Held in Trust" [Liability];
 *   2. a deposit posts Dr cash_clearing / Cr <driver escrow liability>, balanced, through the shared
 *      poster (no new GL math), and moves the escrow balance by exactly the deposit;
 *   3. a release reverses the direction (Dr liability / Cr cash) — the money is returned, not earned;
 *   4. a release larger than the balance is REFUSED, so trust money cannot be over-drawn.
 *
 * (1) and (4) are the ones that protect the company. If the escrow account were ever bound to an
 * Income account the driver's own money would be booked as company earnings, and an unguarded release
 * would let the balance go negative — paying out trust money that was never collected.
 *
 * Placeholder amounts per STANDING-SESSION-DIRECTIVE §7 (clearly-fake test values, labelled).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany, ensureIntegrationPrerequisites, deactivateIsolatedOperatingCompany,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { openEscrow, depositEscrow, releaseEscrow } from "../escrow/service.js";

const run = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

// §7 placeholder numbers — obviously fake, labelled as test data.
const DEPOSIT_CENTS = 120_000; // $1,200.00 new-hire escrow contribution
const RELEASE_CENTS = 50_000; //  $500.00 partial return
const OVER_RELEASE_CENTS = 500_000; // $5,000.00 — more than is held; must be refused

run("stage-3 · new-hire driver escrow (real engine)", () => {
  let db: pg.Client; let companyId: string; let isolated: IsolatedOperatingCompany;
  const s = randomUUID().slice(0, 6);
  const actor = { userId: "00000000-0000-4000-8000-0000000000dd", role: "Owner" };
  const id = { cash: randomUUID(), escrow: randomUUID(), driver: randomUUID() };
  let escrowAccountId = "";

  async function tx(fn: () => Promise<void>) {
    await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls='lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { await fn(); await db.query("COMMIT"); } catch (e) { await db.query("ROLLBACK").catch(()=>{}); throw e; }
  }
  async function read<T=any>(sql: string, p: unknown[]): Promise<T[]> {
    await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls='lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { const r = await db.query(sql, p); await db.query("COMMIT"); return r.rows as T[]; }
    catch (e) { await db.query("ROLLBACK").catch(()=>{}); throw e; }
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    isolated = await createIsolatedOperatingCompany(db, `escrow-hire-${s}`);
    companyId = isolated.companyId;

    await tx(async () => {
      await db.query(`INSERT INTO catalogs.accounts (id,operating_company_id,account_number,account_name,account_type,is_postable) VALUES ($1::uuid,$2::uuid,$3,'Cash Clearing','Asset',true)`, [id.cash, companyId, `CSH${s}`]);
      // Mirrors prod USMCA 2100 "Driver Escrow - Held in Trust" — a LIABILITY. Trust money is owed
      // back to the driver; booking it anywhere else would recognise someone else's money as ours.
      await db.query(`INSERT INTO catalogs.accounts (id,operating_company_id,account_number,account_name,account_type,is_postable) VALUES ($1::uuid,$2::uuid,$3,'Driver Escrow - Held in Trust','Liability',true)`, [id.escrow, companyId, `2100${s}`]);
      await db.query(`INSERT INTO accounting.chart_of_accounts_roles (operating_company_id,role,account_id,is_active) VALUES ($1::uuid,'cash_clearing',$2::uuid,true)`, [companyId, id.cash]);
      await db.query(`INSERT INTO accounting.chart_of_accounts_roles (operating_company_id,role,account_id,is_active) VALUES ($1::uuid,'escrow_liability_default',$2::uuid,true)`, [companyId, id.escrow]);
      await db.query(`INSERT INTO mdata.drivers (id,operating_company_id,first_name,last_name,phone,status) VALUES ($1::uuid,$2::uuid,'NewHire','Driver',$3,'Active')`, [id.driver, companyId, `95606${s.slice(0,5)}`]);
    });
  });

  afterAll(async () => {
    if (!db) return;
    try { await tx(async () => {
      await db.query(`DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id=$1::uuid`, [companyId]);
      if (isolated) await deactivateIsolatedOperatingCompany(db, isolated);
    }); } catch { /* best effort */ }
    await db.end();
  });

  it("opening a new-hire escrow binds it to a LIABILITY account (trust money is owed back)", async () => {
    const acct: any = await openEscrow(
      { operating_company_id: companyId, holder_id: id.driver, holder_type: "driver", purpose: "driver_bond" },
      actor
    );
    escrowAccountId = String(acct?.escrow_account?.id ?? "");
    expect(escrowAccountId).toBeTruthy();

    const [bound] = await read(`
      SELECT a.account_type, a.account_name
        FROM accounting.escrow_accounts e
        JOIN catalogs.accounts a ON a.id = e.coa_account_id
       WHERE e.id = $1::uuid`, [escrowAccountId]);
    expect(bound.account_type).toBe("Liability");
    expect(bound.account_name).toBe("Driver Escrow - Held in Trust");
  });

  it("deposit posts Dr cash / Cr escrow liability, balanced, and moves the balance by exactly the deposit", async () => {
    await depositEscrow(
      { operating_company_id: companyId, escrow_account_id: escrowAccountId, amount_cents: DEPOSIT_CENTS, source_type: "manual" as never, note: "TEST DATA — new-hire escrow contribution" },
      actor
    );

    const legs = await read(`
      SELECT a.account_name, a.account_type, p.debit_or_credit, p.amount_cents::text AS amount_cents
        FROM accounting.escrow_postings ep
        JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = ep.linked_journal_entry_id
        JOIN catalogs.accounts a ON a.id = p.account_id
       WHERE ep.escrow_account_id = $1::uuid AND ep.posting_type = 'deposit'`, [escrowAccountId]);
    const dr = legs.filter((r:any)=>r.debit_or_credit==="debit").reduce((a:number,r:any)=>a+Number(r.amount_cents),0);
    const cr = legs.filter((r:any)=>r.debit_or_credit==="credit").reduce((a:number,r:any)=>a+Number(r.amount_cents),0);
    expect(dr).toBe(cr);
    expect(dr).toBe(DEPOSIT_CENTS);
    // Direction: cash in (debit), liability up (credit). The credit must land on the Liability.
    const credit = legs.find((r:any)=>r.debit_or_credit==="credit");
    expect(credit.account_type).toBe("Liability");

    const [bal] = await read(`SELECT balance_cents::text AS balance_cents FROM accounting.escrow_accounts WHERE id=$1::uuid`, [escrowAccountId]);
    expect(Number(bal.balance_cents)).toBe(DEPOSIT_CENTS);
  });

  it("release reverses the direction and REFUSES to over-draw the trust balance", async () => {
    await releaseEscrow(
      { operating_company_id: companyId, escrow_account_id: escrowAccountId, amount_cents: RELEASE_CENTS, source_type: "manual" as never, note: "TEST DATA — partial escrow return" },
      actor
    );
    const [bal] = await read(`SELECT balance_cents::text AS balance_cents FROM accounting.escrow_accounts WHERE id=$1::uuid`, [escrowAccountId]);
    expect(Number(bal.balance_cents)).toBe(DEPOSIT_CENTS - RELEASE_CENTS);

    const legs = await read(`
      SELECT a.account_type, p.debit_or_credit
        FROM accounting.escrow_postings ep
        JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = ep.linked_journal_entry_id
        JOIN catalogs.accounts a ON a.id = p.account_id
       WHERE ep.escrow_account_id = $1::uuid AND ep.posting_type = 'release'`, [escrowAccountId]);
    // On a release the LIABILITY is debited (comes down) — the mirror of the deposit.
    expect(legs.some((r:any)=>r.account_type==="Liability" && r.debit_or_credit==="debit")).toBe(true);

    // Over-draw must be refused outright. Trust money that was never collected cannot be paid out.
    await expect(releaseEscrow(
      { operating_company_id: companyId, escrow_account_id: escrowAccountId, amount_cents: OVER_RELEASE_CENTS, source_type: "manual" as never, note: "TEST DATA — over-draw attempt" },
      actor
    )).rejects.toThrow();

    const [after] = await read(`SELECT balance_cents::text AS balance_cents FROM accounting.escrow_accounts WHERE id=$1::uuid`, [escrowAccountId]);
    expect(Number(after.balance_cents)).toBe(DEPOSIT_CENTS - RELEASE_CENTS);
    expect(Number(after.balance_cents)).toBeGreaterThanOrEqual(0);
  });
});
