/**
 * 443.113 AJK-12 — a civil fine converted to a driver liability is NOT dismissable in place (real Postgres,
 * real routes). Conversion books a posted driver receivable (Dr driver_fine_receivable / Cr civil_fines_expense)
 * and a pending settlement deduction; dismissing only the fine would leave the driver owing a dismissed fine.
 * The route refuses BY NAME (409 fine_already_converted_to_liability + the liability id + the remedy) — the
 * reduce route's Option B hard block. Before the fix the same request died as a raw 500 on the database lock
 * E_FINE_LOCKED_AFTER_CONVERSION with no remedy. Nothing is changed by the refusal; an unconverted fine still
 * dismisses normally.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerSafetyFinesRoutes } from "../fines.routes.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";

const run = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

run("AJK-12 — a converted fine is not dismissable in place", () => {
  let db: pg.Client;
  let isolated: IsolatedOperatingCompany;
  let companyId: string;
  let app: FastifyInstance;
  const s = randomUUID().slice(0, 6);
  const driverId = randomUUID();
  const receivable = randomUUID();

  async function tx<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls='lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      const r = await fn();
      await db.query("COMMIT");
      return r;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }
  const read = <T = any>(sql: string, p: unknown[]) => tx(async () => (await db.query(sql, p)).rows as T[]);

  async function newFine(amountCents: number): Promise<string> {
    const id = randomUUID();
    await tx(() =>
      db.query(
        `INSERT INTO safety.civil_fines (id, operating_company_id, subject_type, subject_driver_id, issued_by_authority, jurisdiction,
                                         violation_description, issued_date, amount_cents, status)
         VALUES ($1::uuid, $2::uuid, 'driver', $3::uuid, 'TX DPS', 'TX', $4, CURRENT_DATE, $5, 'open')`,
        [id, companyId, driverId, `Overweight ${s}`, amountCents]
      )
    );
    return id;
  }
  const convert = (fineId: string) =>
    app.inject({
      method: "POST",
      url: `/api/v1/safety/fines/${fineId}/convert-to-liability?operating_company_id=${companyId}`,
      headers: testAuthHeaders(TEST_OWNER_USER_ID, "Owner"),
    });
  const dismiss = (fineId: string, role = "Owner") =>
    app.inject({
      method: "POST",
      url: `/api/v1/safety/fines/${fineId}/dismiss?operating_company_id=${companyId}`,
      headers: testAuthHeaders(TEST_OWNER_USER_ID, role),
      payload: { notes: "Dismissed by the court" },
    });
  const receivableNetCents = async (liabilityId: string) =>
    Number(
      (
        await read<{ net: string }>(
          `SELECT COALESCE(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS net
             FROM accounting.journal_entry_postings p
            WHERE p.operating_company_id = $1::uuid AND p.account_id = $2::uuid
              AND p.source_transaction_type = 'driver_liability' AND p.source_transaction_id = $3`,
          [companyId, receivable, liabilityId]
        )
      )[0]?.net ?? 0
    );

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    isolated = await createIsolatedOperatingCompany({ label: "ajk12-fine-dismiss" });
    companyId = isolated.companyId;
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL!));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await tx(async () => {
      const expense = randomUUID();
      await db.query(
        `INSERT INTO catalogs.accounts (id,operating_company_id,account_number,account_name,account_type,is_postable)
         VALUES ($1::uuid,$2::uuid,$3,'Driver Fine Receivable','Asset',true), ($4::uuid,$2::uuid,$5,'Fines & Penalties','Expense',true)`,
        [receivable, companyId, `DFR${s}`, expense, `FNP${s}`]
      );
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id,role,account_id,is_active)
         VALUES ($1::uuid,'driver_fine_receivable',$2::uuid,true), ($1::uuid,'civil_fines_expense',$3::uuid,true)`,
        [companyId, receivable, expense]
      );
      await db.query(
        `INSERT INTO mdata.drivers (id,operating_company_id,first_name,last_name,phone,status) VALUES ($1::uuid,$2::uuid,'Fine','Driver',$3,'Active')`,
        [driverId, companyId, `95612${s.slice(0, 5)}`]
      );
    });
    app = await createIntegrationApp(registerSafetyFinesRoutes);
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await tx(async () => {
        await db.query(`DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id=$1::uuid`, [companyId]);
        if (isolated) await deactivateIsolatedOperatingCompany(db, isolated);
      });
    } catch {
      /* best effort */
    }
    await app?.close().catch(() => {});
    await db.end();
  });

  it("a converted fine is refused by name with the remedy — fine, liability, deduction and receivable unchanged", async () => {
    const fineId = await newFine(25_000);
    const conv = await convert(fineId);
    expect(conv.statusCode, conv.body).toBe(200);
    const { liability, deduction_id } = conv.json() as { liability: { id: string }; deduction_id: string };
    expect(await receivableNetCents(liability.id)).toBe(25_000);

    const res = await dismiss(fineId);
    expect(res.statusCode, res.body).toBe(409);
    const body = res.json() as { error: string; driver_liability_id: string; message: string };
    expect(body.error).toBe("fine_already_converted_to_liability");
    expect(body.driver_liability_id).toBe(liability.id);
    expect(body.message).toMatch(/void/i);

    const [fine] = await read<{ status: string }>(`SELECT status FROM safety.civil_fines WHERE id = $1::uuid`, [fineId]);
    expect(fine.status).not.toBe("dismissed");
    const [liab] = await read<{ voided_at: string | null; status: string }>(
      `SELECT voided_at::text, status FROM driver_finance.driver_liabilities WHERE id = $1::uuid`,
      [liability.id]
    );
    expect(liab.voided_at).toBeNull();
    const [ded] = await read<{ voided_at: string | null }>(
      `SELECT voided_at::text FROM driver_finance.driver_settlement_deductions WHERE id = $1::uuid`,
      [deduction_id]
    );
    expect(ded.voided_at).toBeNull();
    expect(await receivableNetCents(liability.id)).toBe(25_000);
  });

  it("an unconverted fine still dismisses", async () => {
    const fineId = await newFine(10_000);
    const res = await dismiss(fineId);
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as { status: string }).status).toBe("dismissed");
  });
});
