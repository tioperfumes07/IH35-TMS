/**
 * RLS-FIX — accounting.bill_lines / accounting.expense_lines tenant isolation (real Postgres)
 *
 * Proves the policies added in
 *   db/migrations/202606080040_enable_rls_bill_lines_expense_lines.sql
 * actually enforce operating-company (OCI) isolation against a live Postgres.
 *
 * Design context (see migration header for full detail):
 *   - bill_lines has NO operating_company_id column → isolation is derived from
 *     its parent accounting.bills.operating_company_id.
 *   - expense_lines has no operating_company_id AND its parent accounting.expenses
 *     does not exist in prod/CI → policy is deny-by-default (lucia bypass only).
 *
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available,
 * matching the existing accounting DB integration suites.
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("bill_lines / expense_lines RLS tenant isolation (real Postgres)", () => {
  let db: pg.Client;
  let primaryCompanyId: string;
  let secondaryCompanyId: string;
  let createdSecondaryCompany = false;

  // Unique per run so parallel vitest forks never collide.
  const suffix = randomUUID();
  const primaryBillId = randomUUID();
  const secondaryBillId = randomUUID();
  const primaryLineId = randomUUID();
  const secondaryLineId = randomUUID();
  const expenseLineId = randomUUID();
  const orphanExpenseId = randomUUID();

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

  async function withScope<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    try {
      // Scoped session: company set, NO bypass — policies must apply.
      await db.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
      const out = await fn();
      await db.query("COMMIT");
      return out;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  beforeAll(async () => {
    primaryCompanyId = await ensureIntegrationPrerequisites();

    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");

    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");

    // Resolve (or provision) a SECOND operating company so we have two tenants.
    secondaryCompanyId = await withBypass(async () => {
      const existing = await db.query<{ id: string }>(
        `SELECT id FROM org.companies WHERE id <> $1::uuid ORDER BY created_at ASC LIMIT 1`,
        [primaryCompanyId]
      );
      if (existing.rows[0]?.id) return existing.rows[0].id;

      const created = await db.query<{ id: string }>(
        `
          INSERT INTO org.companies (code, legal_name, company_type)
          VALUES ($1, $2, 'operating_carrier')
          RETURNING id
        `,
        [`RLSX-${suffix.slice(0, 8)}`, `RLS Fixture Co ${suffix.slice(0, 8)}`]
      );
      createdSecondaryCompany = true;
      return created.rows[0].id;
    });

    // Seed: one bill + one bill_line per tenant, plus an orphan expense_line.
    await withBypass(async () => {
      await db.query(
        `INSERT INTO accounting.bills (id, operating_company_id, status) VALUES ($1::uuid, $2::uuid, 'unpaid')`,
        [primaryBillId, primaryCompanyId]
      );
      await db.query(
        `INSERT INTO accounting.bills (id, operating_company_id, status) VALUES ($1::uuid, $2::uuid, 'unpaid')`,
        [secondaryBillId, secondaryCompanyId]
      );
      await db.query(
        `INSERT INTO accounting.bill_lines (id, bill_id, line_sequence, amount, description) VALUES ($1::uuid, $2::uuid, 1, 100.00, $3)`,
        [primaryLineId, primaryBillId, `primary-${suffix}`]
      );
      await db.query(
        `INSERT INTO accounting.bill_lines (id, bill_id, line_sequence, amount, description) VALUES ($1::uuid, $2::uuid, 1, 200.00, $3)`,
        [secondaryLineId, secondaryBillId, `secondary-${suffix}`]
      );
      await db.query(
        `INSERT INTO accounting.expense_lines (id, expense_id, line_sequence, amount, description) VALUES ($1::uuid, $2::uuid, 1, 50.00, $3)`,
        [expenseLineId, orphanExpenseId, `expense-${suffix}`]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    await withBypass(async () => {
      await db.query(`DELETE FROM accounting.bill_lines WHERE id = ANY($1::uuid[])`, [[primaryLineId, secondaryLineId]]);
      await db.query(`DELETE FROM accounting.expense_lines WHERE id = $1::uuid`, [expenseLineId]);
      await db.query(`DELETE FROM accounting.bills WHERE id = ANY($1::uuid[])`, [[primaryBillId, secondaryBillId]]);
      if (createdSecondaryCompany) {
        await db.query(`DELETE FROM org.companies WHERE id = $1::uuid`, [secondaryCompanyId]);
      }
    }).catch(() => {});
    await db.end().catch(() => {});
  });

  it("has RLS enabled AND forced on all three audited tables", async () => {
    const res = await db.query<{ relname: string; rls: boolean; forced: boolean }>(
      `
        SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'accounting'
          AND c.relname IN ('bill_lines', 'expense_lines', 'line_category_load_required')
        ORDER BY c.relname
      `
    );
    expect(res.rows).toHaveLength(3);
    for (const row of res.rows) {
      expect(row.rls, `${row.relname} rowsecurity`).toBe(true);
      expect(row.forced, `${row.relname} forcerowsecurity`).toBe(true);
    }
  });

  it("has the expected RLS policies on each audited table", async () => {
    const res = await db.query<{ relname: string; polname: string }>(
      `
        SELECT c.relname, p.polname
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'accounting'
          AND c.relname IN ('bill_lines', 'expense_lines', 'line_category_load_required')
      `
    );
    const policies = new Set(res.rows.map((r) => `${r.relname}.${r.polname}`));
    expect(policies.has("bill_lines.bill_lines_company_isolation")).toBe(true);
    expect(policies.has("expense_lines.expense_lines_company_isolation")).toBe(true);
    // Global reference table: authenticated-user read + write policies (no OCI column).
    expect(policies.has("line_category_load_required.line_category_load_required_select")).toBe(true);
    expect(policies.has("line_category_load_required.line_category_load_required_write")).toBe(true);
  });

  it("line_category_load_required (global reference table) is readable under lucia bypass", async () => {
    const count = await withBypass(async () => {
      const res = await db.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM accounting.line_category_load_required`
      );
      return Number(res.rows[0]?.c ?? -1);
    });
    // Seeded by migration 0093 (diesel/def/toll/...); assert RLS does not block bypass reads.
    expect(count).toBeGreaterThan(0);
  });

  it("primary-company session sees only its own bill_line", async () => {
    const ids = await withScope(primaryCompanyId, async () => {
      const res = await db.query<{ id: string }>(
        `SELECT id FROM accounting.bill_lines WHERE id = ANY($1::uuid[])`,
        [[primaryLineId, secondaryLineId]]
      );
      return res.rows.map((r) => r.id);
    });
    expect(ids).toContain(primaryLineId);
    expect(ids).not.toContain(secondaryLineId);
  });

  it("secondary-company session sees only its own bill_line", async () => {
    const ids = await withScope(secondaryCompanyId, async () => {
      const res = await db.query<{ id: string }>(
        `SELECT id FROM accounting.bill_lines WHERE id = ANY($1::uuid[])`,
        [[primaryLineId, secondaryLineId]]
      );
      return res.rows.map((r) => r.id);
    });
    expect(ids).toContain(secondaryLineId);
    expect(ids).not.toContain(primaryLineId);
  });

  it("rejects a bill_line INSERT onto another company's bill (WITH CHECK)", async () => {
    let caught: (Error & { code?: string }) | undefined;
    try {
      await withScope(primaryCompanyId, async () => {
        // secondaryBillId belongs to the OTHER tenant — must be rejected.
        await db.query(
          `INSERT INTO accounting.bill_lines (bill_id, line_sequence, amount, description) VALUES ($1::uuid, 99, 1.00, $2)`,
          [secondaryBillId, `cross-oci-${suffix}`]
        );
      });
    } catch (err) {
      caught = err as Error & { code?: string };
    }
    expect(caught, "cross-OCI bill_line insert should be rejected").toBeDefined();
    expect(caught?.code).toBe("42501"); // insufficient_privilege — RLS WITH CHECK violation
  });

  it("expense_lines are invisible to any scoped (non-bypass) session, but visible under bypass", async () => {
    const scopedCount = await withScope(primaryCompanyId, async () => {
      const res = await db.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM accounting.expense_lines WHERE id = $1::uuid`,
        [expenseLineId]
      );
      return Number(res.rows[0]?.c ?? -1);
    });
    expect(scopedCount).toBe(0);

    const bypassCount = await withBypass(async () => {
      const res = await db.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM accounting.expense_lines WHERE id = $1::uuid`,
        [expenseLineId]
      );
      return Number(res.rows[0]?.c ?? -1);
    });
    expect(bypassCount).toBe(1);
  });
});
