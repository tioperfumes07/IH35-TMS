/**
 * ACCT-F177 — every user-scoped write must NAME its actor in the WORM audit trail (real Postgres).
 *
 * WHAT WAS BROKEN, measured on prod br-fancy-credit-akjnd07a 2026-08-07: `audit.row_changes` held
 * 2,327,275 rows of which **2** carried `changed_by_user_id` and **0** carried `changed_by_role`;
 * 266,994 rows were written in the last seven days and not one named an actor. The WORM trail recorded
 * WHAT changed and never WHO — for a company in Chapter 11 with live litigation, that is the half an
 * auditor, an insurer or a court actually asks for.
 *
 * ROOT CAUSE: `audit.tg_audit_row` resolved the actor from `current_setting('app.user_id')`, and the
 * application never sets that key. Across apps/backend/src, `app.user_id` appears in ZERO set_config
 * calls; the actor everything else uses is `app.current_user_id`, set by `withCurrentUser`. The trigger
 * had been reading a GUC nobody writes since the day it was installed.
 *
 * WHY THIS TEST GOES THROUGH `withCurrentUser` AND NOT A HAND-SET GUC. Setting the GUC myself and
 * asserting the trigger reads it would prove only that the trigger reads what I just set — it would
 * pass just as happily against a second wrong key, because I would have written that key too. Driving
 * the REAL transaction wrapper is what ties the assertion to production behaviour: if a future change
 * renames the GUC on either side, this fails.
 *
 * IT ASSERTS BOTH COLUMNS. Actor alone is not the requirement — `changed_by_role` was 0 of 2.3M for a
 * separate reason (the role GUC is set by 14 route files and never by the funnel), and a fix that
 * named the user while leaving the role NULL would look green and still not answer "who, acting as
 * what". The role here arrives via the identity.users fallback, which is the path that covers every
 * write rather than the 14 that remember.
 *
 * CLASS, NOT TABLE: `audit.tg_audit_row` is SECURITY DEFINER and sits behind 39 triggers, so this is
 * the shared WORM path. The test writes to TWO unrelated audited tables — mdata.customers and
 * accounting.invoices — because a single-table assertion could pass on a per-table fix while the class
 * stayed broken.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { withCurrentUser } from "../../auth/db.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("ACCT-F177 — WORM row_changes names the actor and the role", () => {
  let db: pg.Client;
  let isolated: IsolatedOperatingCompany;
  let companyId: string;

  const suffix = randomUUID().slice(0, 6);
  const userId = "00000000-0000-4000-8000-0000000000f7";
  const customerId = randomUUID();

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      await fn();
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  /** Newest audit row for a table, read under bypass (audit.row_changes is not tenant-readable). */
  async function newestAudit(table: string) {
    const res = await db.query<{ changed_by_user_id: string | null; changed_by_role: string | null; op: string }>(
      `SELECT changed_by_user_id::text AS changed_by_user_id, changed_by_role, op
         FROM audit.row_changes
        WHERE table_name = $1 AND tenant_id = $2::uuid
        ORDER BY changed_at DESC
        LIMIT 1`,
      [table, companyId]
    );
    return res.rows[0] ?? null;
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    // buildPgClientConfig REQUIRES the connection string; calling it bare compiles clean and then
    // falls through to pg's localhost default (ECONNREFUSED in CI). Read it explicitly.
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for this db.test");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();

    await bypass(async () => {
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language)
         VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [userId, `worm-actor-${suffix}@example.test`]
      );
    });

    isolated = await createIsolatedOperatingCompany({
      codePrefix: "WRM",
      legalNamePrefix: "Worm Actor",
      actorUserId: userId,
    });
    companyId = isolated.companyId;
  });

  afterAll(async () => {
    if (!db) return;
    try {
      if (isolated) await deactivateIsolatedOperatingCompany(isolated);
    } catch {
      /* best-effort — never mask a real assertion failure */
    }
    await db.end();
  });

  it("a write through withCurrentUser names the actor AND the role on mdata.customers", async () => {
    await withCurrentUser(userId, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
      await client.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`,
        [customerId, companyId, `WORM Actor Cust ${suffix}`]
      );
    });

    const row = await newestAudit("customers");
    expect(row).not.toBeNull();
    expect(row?.op).toBe("INSERT");
    // THE assertion. Before ACCT-F177 this was NULL on 2,327,273 of 2,327,275 prod rows.
    expect(row?.changed_by_user_id).toBe(userId);
    // And the role, which was NULL on ALL of them — a fix that named only the user would look green.
    expect(row?.changed_by_role).toBeTruthy();
  });

  it("the SAME fix attributes a second, unrelated audited table — accounting.invoices", async () => {
    // A single-table assertion could pass against a per-table patch while the shared WORM path stayed
    // broken. audit.tg_audit_row sits behind 39 triggers; this proves the class, not one row.
    const invoiceId = randomUUID();
    await withCurrentUser(userId, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
      await client.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,1000,0,1000,'draft')`,
        // display_id is CHECK-constrained to ^INV-[0-9]{4}-[0-9]{5}$ and UNIQUE per
        // (operating_company_id, display_id). A fixed value is safe because this suite owns an
        // isolated company, so it cannot collide with the INV-2026-000xx rows on shared entities.
        [invoiceId, companyId, customerId, "INV-2026-00001"]
      );
    });

    const row = await newestAudit("invoices");
    expect(row).not.toBeNull();
    expect(row?.changed_by_user_id).toBe(userId);
    expect(row?.changed_by_role).toBeTruthy();
  });
});
