/**
 * BANK-ECON-04 / BANK-SURF-04 — reconciliation "start session" live path (real Postgres).
 *
 * ROOT CAUSE the audit (`~/Desktop/IH35-CURSOR-AUDIT/modules/banking.md`, 2026-07-24) surfaced:
 * `banking.reconciliation_sessions` = 0 on prod despite #3417 (zero-diff closure) merged. Static
 * review of the code (not memory) confirms the path is fully wired, not dead/unmounted/mis-routed:
 *   - `POST /api/v1/banking/reconciliation/start` is registered in index.ts
 *     (`await registerBankingReconciliationRoutes(app)`).
 *   - Both entry points call the SAME `startReconciliationSession()` client fn -> the SAME route:
 *     BankingHome.tsx "+ Start first reconciliation" / "+ Reconcile" modal, and
 *     ReconciliationWorkspace.tsx inline "Create Session" form.
 *   - `audit.audit_events` on prod (Neon, bypass lucia, 2026-07-24) has ZERO rows for
 *     `event_class LIKE 'banking.reconciliation%'` — not a masked failure (a 403/500 would also
 *     leave zero audit rows), but consistent with "no operator has ever completed this flow",
 *     which is what this suite exists to make provable rather than asserted.
 * This suite exercises the ACTIVE PATH end-to-end against a real migrated Postgres so "wired but
 * ops-empty" is evidence, not a guess: start -> workspace -> zero-diff close (#3417) -> non-zero
 * variance requires an Owner-only reasoned force-complete -> both list buckets (open/completed)
 * reflect it. Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { registerBankingReconciliationRoutes } from "../reconciliation.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("BANK-ECON-04 reconciliation start-session live path (real Postgres)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let companyId: string;
  let bankAccountId: string;
  const suffix = randomUUID().slice(0, 8);

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try {
      const result = await fn();
      await db.query("COMMIT");
      return result;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  function isoDate(offsetDays: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  async function startSession(opts: {
    statementBalanceCents: number;
    periodStart: string;
    periodEnd: string;
    headers?: Record<string, string>;
  }) {
    return app.inject({
      method: "POST",
      url: "/api/v1/banking/reconciliation/start",
      headers: opts.headers ?? testAuthHeaders(undefined, "Owner"),
      payload: {
        bank_account_id: bankAccountId,
        period_start: opts.periodStart,
        period_end: opts.periodEnd,
        statement_balance_cents: opts.statementBalanceCents,
      },
    });
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();

    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL!;
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");

    bankAccountId = await bypass(async () => {
      const res = await db.query<{ id: string }>(
        `INSERT INTO banking.bank_accounts (operating_company_id, account_name, account_type)
         VALUES ($1::uuid, $2, 'checking') RETURNING id`,
        [companyId, `BANK-ECON-04 recon start-session ${suffix}`]
      );
      return res.rows[0]!.id;
    });

    app = await createIntegrationApp(async (a) => {
      await registerBankingReconciliationRoutes(a);
    });
  });

  afterAll(async () => {
    await app.close();
    await db.end();
  });

  it("POST /start (the button's exact endpoint) inserts a REAL banking.reconciliation_sessions row and lists it as open", async () => {
    const periodStart = isoDate(-30);
    const periodEnd = isoDate(-1);
    const res = await startSession({ statementBalanceCents: 0, periodStart, periodEnd });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { session_id?: string };
    expect(body.session_id).toBeTruthy();
    expect(body.session_id).toMatch(/^[0-9a-f-]{36}$/i);

    // Proves the row is REAL (not a mocked/short-circuited 200) — read it back with RLS enforced,
    // scoped exactly like the route itself, not a bypass shortcut that could hide a wrong-company write.
    const row = await bypass(async () => {
      const r = await db.query(
        `SELECT operating_company_id::text, bank_account_id::text, period_start::text, period_end::text,
                statement_balance_cents::int, status
           FROM banking.reconciliation_sessions WHERE id = $1::uuid`,
        [body.session_id]
      );
      return r.rows[0];
    });
    expect(row).toBeTruthy();
    expect(row.operating_company_id).toBe(companyId);
    expect(row.bank_account_id).toBe(bankAccountId);
    expect(row.status).toBe("open");
    expect(row.statement_balance_cents).toBe(0);

    const list = await app.inject({
      method: "GET",
      url: `/api/v1/banking/reconciliation/sessions?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(list.statusCode).toBe(200);
    const listBody = list.json() as { open_sessions: Array<{ id: string }> };
    expect(listBody.open_sessions.some((s) => s.id === body.session_id)).toBe(true);
  });

  it("POST /start is gated by role (Driver -> 403, no row written) — the button is not a silent no-op nor an open door", async () => {
    const before = await bypass(async () => {
      const r = await db.query(`SELECT count(*)::int AS n FROM banking.reconciliation_sessions WHERE bank_account_id = $1::uuid`, [
        bankAccountId,
      ]);
      return r.rows[0].n as number;
    });

    const res = await startSession({
      statementBalanceCents: 0,
      periodStart: isoDate(-30),
      periodEnd: isoDate(-1),
      headers: testAuthHeaders(undefined, "Driver"),
    });
    expect(res.statusCode).toBe(403);

    const after = await bypass(async () => {
      const r = await db.query(`SELECT count(*)::int AS n FROM banking.reconciliation_sessions WHERE bank_account_id = $1::uuid`, [
        bankAccountId,
      ]);
      return r.rows[0].n as number;
    });
    expect(after).toBe(before);
  });

  it("GET workspace + POST /complete closes a REAL zero-diff session with no override needed (#3417 live proof)", async () => {
    const periodStart = isoDate(-60);
    const periodEnd = isoDate(-31);
    const started = await startSession({ statementBalanceCents: 0, periodStart, periodEnd });
    expect(started.statusCode).toBe(200);
    const { session_id: sessionId } = started.json() as { session_id: string };

    const workspace = await app.inject({
      method: "GET",
      url: `/api/v1/banking/reconciliation/${sessionId}?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    expect(workspace.statusCode).toBe(200);
    const workspaceBody = workspace.json() as { summary: { variance_cents: number }; matched_transactions: unknown[] };
    expect(workspaceBody.summary.variance_cents).toBe(0);
    expect(workspaceBody.matched_transactions).toEqual([]);

    const complete = await app.inject({
      method: "POST",
      url: `/api/v1/banking/reconciliation/${sessionId}/complete?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {},
    });
    expect(complete.statusCode).toBe(200);
    const completeBody = complete.json() as { ok: boolean; variance_cents: number };
    expect(completeBody.ok).toBe(true);
    expect(completeBody.variance_cents).toBe(0);

    const row = await bypass(async () => {
      const r = await db.query(
        `SELECT status, reconciled_by_user_id::text, reconciled_at FROM banking.reconciliation_sessions WHERE id = $1::uuid`,
        [sessionId]
      );
      return r.rows[0];
    });
    expect(row.status).toBe("reconciled");
    expect(row.reconciled_by_user_id).toBe(TEST_OWNER_USER_ID);
    expect(row.reconciled_at).toBeTruthy();

    const list = await app.inject({
      method: "GET",
      url: `/api/v1/banking/reconciliation/sessions?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
    });
    const listBody = list.json() as { completed_sessions: Array<{ id: string }> };
    expect(listBody.completed_sessions.some((s) => s.id === sessionId)).toBe(true);
  });

  it("POST /complete rejects a non-zero variance without override, and requires Owner (not Accountant) + a reason to force-close (#3417 live proof)", async () => {
    const periodStart = isoDate(-90);
    const periodEnd = isoDate(-61);
    // No matched transactions exist for this account/period, so book_balance = 0 and
    // variance_cents = statement_balance_cents exactly — deterministic non-zero on purpose.
    const started = await startSession({ statementBalanceCents: 5000, periodStart, periodEnd });
    expect(started.statusCode).toBe(200);
    const { session_id: sessionId } = started.json() as { session_id: string };

    const rejected = await app.inject({
      method: "POST",
      url: `/api/v1/banking/reconciliation/${sessionId}/complete?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
      payload: {},
    });
    expect(rejected.statusCode).toBe(409);
    expect((rejected.json() as { error: string; variance_cents: number }).error).toBe("reconciliation_difference_not_zero");
    expect((rejected.json() as { variance_cents: number }).variance_cents).toBe(5000);

    const stillOpen = await bypass(async () => {
      const r = await db.query(`SELECT status FROM banking.reconciliation_sessions WHERE id = $1::uuid`, [sessionId]);
      return r.rows[0].status as string;
    });
    expect(stillOpen).toBe("open");

    const accountantForceDenied = await app.inject({
      method: "POST",
      url: `/api/v1/banking/reconciliation/${sessionId}/complete?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Accountant"),
      payload: { force_complete: true, reason: "test override attempt by non-owner" },
    });
    expect(accountantForceDenied.statusCode).toBe(403);
    expect((accountantForceDenied.json() as { error: string }).error).toBe("force_complete_requires_owner");

    const ownerForceNoReason = await app.inject({
      method: "POST",
      url: `/api/v1/banking/reconciliation/${sessionId}/complete?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
      payload: { force_complete: true },
    });
    expect(ownerForceNoReason.statusCode).toBe(400);
    expect((ownerForceNoReason.json() as { error: string }).error).toBe("force_complete_reason_required");

    const ownerForceWithReason = await app.inject({
      method: "POST",
      url: `/api/v1/banking/reconciliation/${sessionId}/complete?operating_company_id=${companyId}`,
      headers: testAuthHeaders(undefined, "Owner"),
      payload: { force_complete: true, reason: "BANK-ECON-04 live-proof: accountable Owner override" },
    });
    expect(ownerForceWithReason.statusCode).toBe(200);
    expect((ownerForceWithReason.json() as { ok: boolean; variance_cents: number }).variance_cents).toBe(5000);

    const closed = await bypass(async () => {
      const r = await db.query(`SELECT status, notes FROM banking.reconciliation_sessions WHERE id = $1::uuid`, [sessionId]);
      return r.rows[0];
    });
    expect(closed.status).toBe("reconciled");
    expect(String(closed.notes)).toContain("force_complete_reason:");
  });
});
