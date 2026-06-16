/**
 * FH-3 Amortization — persistence (real Postgres). Proves createLoanWithSchedule writes a loan +
 * a full amortization schedule to finance.* (no GL posting), and getLoanSchedule reads it back
 * balanced (principal sums to the loan, final balance 0). Runs only in CI (GITHUB_ACTIONS=true).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { createLoanWithSchedule, getLoanSchedule } from "../amortization.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("FH-3 amortization persistence (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const userId = "00000000-0000-4000-8000-0000000000aa";
  const createdLoanIds: string[] = [];

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    try { const r = await fn(); await db.query("COMMIT"); return r; }
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
        [userId, `fh3-${randomUUID()}@test.local`]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(`DELETE FROM finance.loan_amortization_rows WHERE loan_id = ANY($1::uuid[])`, [createdLoanIds]);
        await db.query(`DELETE FROM finance.loans WHERE id = ANY($1::uuid[])`, [createdLoanIds]);
      });
    } catch { /* best-effort */ }
    await db.end();
  });

  it("creates a loan + persists a balanced amortization schedule (principal sums to loan, ends at 0)", async () => {
    const result = await bypass(() =>
      createLoanWithSchedule(db, userId, {
        operating_company_id: companyId,
        name: `Test Truck Loan ${randomUUID().slice(0, 6)}`,
        lender: "Commercial Credit Group",
        original_principal_cents: 4_000_000, // $40,000
        interest_rate_bps: 650, // 6.50%
        term_months: 60,
        first_payment_date: "2026-07-01",
      })
    );
    createdLoanIds.push(result.loan.id);
    expect(result.loan.loan_type).toBe("note_payable"); // 60mo > 12
    expect(result.rows).toHaveLength(60);

    const schedule = await bypass(() => getLoanSchedule(db, companyId, result.loan.id));
    expect(schedule).toHaveLength(60);
    const principalSum = schedule.reduce((a, r) => a + r.principal_cents, 0);
    expect(principalSum).toBe(4_000_000); // principal repaid == loan
    expect(schedule[schedule.length - 1].remaining_balance_cents).toBe(0); // ends at zero
    expect(schedule.every((r) => r.posted === false)).toBe(true); // nothing posted (Tier-3)
    expect(schedule[0].interest_cents).toBeGreaterThan(0);
  });
});
