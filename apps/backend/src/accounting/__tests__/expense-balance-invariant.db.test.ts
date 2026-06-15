/**
 * GAP-EXPENSES Phase 1.5 — expense total=sum balance invariant (real Postgres).
 *
 * Proves the deferred constraint triggers added in
 *   db/migrations/202606151400_expense_lines_cents_and_balance_invariant.sql
 * enforce, in integer cents, that a GL-posted expense's stored total equals the
 * sum of its line cents — and ONLY when posting_status='posted' (inert otherwise).
 *
 * GATE: posting_status (GL state), NOT status. The route writes status='posted'
 * (=finalized) on every expense; posting_status defaults 'unposted' and is only set
 * 'posted' by Phase-2 posting → the gate is inert in Phase 1.5.
 *
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("expense total=sum balance invariant (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID();
  const driverId = randomUUID();
  const committedExpenseIds: string[] = [];

  // Seed a posted/unposted expense (+ optional lines) inside ONE transaction and COMMIT.
  // Deferred constraint triggers fire at COMMIT, so a violation surfaces when the tx commits.
  async function seedExpenseTx(opts: {
    expenseId: string;
    postingStatus: "unposted" | "posted";
    totalCents: number;
    lineCents: number[];
    track?: boolean;
  }): Promise<Error | null> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    try {
      await db.query(
        `INSERT INTO accounting.expenses
           (id, operating_company_id, driver_uuid, transaction_date, total_amount_cents, status, posting_status)
         VALUES ($1::uuid, $2::uuid, $3::uuid, CURRENT_DATE, $4, 'posted', $5)`,
        [opts.expenseId, companyId, driverId, opts.totalCents, opts.postingStatus]
      );
      let seq = 1;
      for (const c of opts.lineCents) {
        await db.query(
          `INSERT INTO accounting.expense_lines (expense_id, line_sequence, amount_cents, amount, description)
           VALUES ($1::uuid, $2, $3, $4, $5)`,
          [opts.expenseId, seq++, c, c / 100, `line-${suffix}`]
        );
      }
      await db.query("COMMIT");
      if (opts.track !== false) committedExpenseIds.push(opts.expenseId);
      return null;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      return err as Error;
    }
  }

  async function updateTx(sql: string, params: unknown[]): Promise<Error | null> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    try {
      await db.query(sql, params);
      await db.query("COMMIT");
      return null;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      return err as Error;
    }
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(
      `INSERT INTO mdata.drivers (id, first_name, last_name, phone) VALUES ($1::uuid,'INV','Fixture',$2)`,
      [driverId, `+1001${suffix.slice(0, 7)}`]
    );
    await db.query("COMMIT");
  });

  afterAll(async () => {
    if (!db) return;
    await db.query("BEGIN").catch(() => {});
    await db.query("SET LOCAL app.bypass_rls = 'lucia'").catch(() => {});
    await db.query(`DELETE FROM accounting.expense_lines WHERE expense_id = ANY($1::uuid[])`, [committedExpenseIds]).catch(() => {});
    await db.query(`DELETE FROM accounting.expenses WHERE id = ANY($1::uuid[])`, [committedExpenseIds]).catch(() => {});
    await db.query(`DELETE FROM mdata.drivers WHERE id = $1::uuid`, [driverId]).catch(() => {});
    await db.query("COMMIT").catch(() => {});
    await db.end().catch(() => {});
  });

  it("posted, total == sum(lines) -> commits", async () => {
    const err = await seedExpenseTx({ expenseId: randomUUID(), postingStatus: "posted", totalCents: 5000, lineCents: [3000, 2000] });
    expect(err).toBeNull();
  });

  it("posted, total != sum(lines) -> raises 23514", async () => {
    const err = await seedExpenseTx({ expenseId: randomUUID(), postingStatus: "posted", totalCents: 5000, lineCents: [3000, 1000], track: false });
    expect(err, "mis-summed posted expense must be rejected").toBeTruthy();
    expect((err as Error & { code?: string }).code).toBe("23514");
  });

  it("unposted, total != sum -> commits (gate inert in Phase 1.5)", async () => {
    const err = await seedExpenseTx({ expenseId: randomUUID(), postingStatus: "unposted", totalCents: 5000, lineCents: [3000, 1000] });
    expect(err, "unposted expenses are exempt from the gate").toBeNull();
  });

  it("post-then-mutate: coherent posted, then UPDATE header total to unbalance -> raises", async () => {
    const id = randomUUID();
    const seed = await seedExpenseTx({ expenseId: id, postingStatus: "posted", totalCents: 4000, lineCents: [4000] });
    expect(seed).toBeNull();
    const err = await updateTx(`UPDATE accounting.expenses SET total_amount_cents = 9999 WHERE id = $1::uuid`, [id]);
    expect(err, "mutating a posted header total to mismatch must be rejected").toBeTruthy();
    expect((err as Error & { code?: string }).code).toBe("23514");
  });

  it("post-then-mutate: coherent posted, then UPDATE a line amount to unbalance -> raises", async () => {
    const id = randomUUID();
    const seed = await seedExpenseTx({ expenseId: id, postingStatus: "posted", totalCents: 4000, lineCents: [4000] });
    expect(seed).toBeNull();
    const err = await updateTx(`UPDATE accounting.expense_lines SET amount_cents = 1 WHERE expense_id = $1::uuid`, [id]);
    expect(err, "mutating a posted line to mismatch must be rejected").toBeTruthy();
    expect((err as Error & { code?: string }).code).toBe("23514");
  });

  it("ONE-SHOT INSERT of a posted, line-less expense with total>0 -> raises (proves INSERT coverage)", async () => {
    // This FAILS if the header trigger is UPDATE-only — it is the proof INSERT coverage is real.
    const err = await seedExpenseTx({ expenseId: randomUUID(), postingStatus: "posted", totalCents: 5000, lineCents: [], track: false });
    expect(err, "a one-shot posted line-less expense with total>0 must be rejected").toBeTruthy();
    expect((err as Error & { code?: string }).code).toBe("23514");
  });

  it("bill path is unaffected: no balance trigger exists on accounting.bills / bill_lines", async () => {
    // The invariant is expense-branch-only. Prove the triggers live only on the expense tables.
    const res = await db.query<{ relname: string; tgname: string }>(
      `SELECT c.relname, t.tgname
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE t.tgname IN ('trg_expense_total_matches_lines','trg_expense_header_total_matches_lines')`
    );
    const tables = new Set(res.rows.map((r) => r.relname));
    expect(tables.has("expense_lines")).toBe(true);
    expect(tables.has("expenses")).toBe(true);
    expect(tables.has("bills")).toBe(false);
    expect(tables.has("bill_lines")).toBe(false);
  });
});
