/**
 * LEAD 443.114 (AJK-12 ruling) — a fine dismissed (e.g. in court) clears the driver charge in ONE action (real Postgres,
 * real routes). Dismissing a CONVERTED fine voids its driver liability through the one void engine (pending deduction
 * voided, receivable reversed, schedule held, audited) THEN marks the fine dismissed, in one transaction. The DB lock
 * (migration 202615820910) allows converted -> dismissed only once the liability is voided, and lets the converted
 * pointer be cleared only when its liability does not exist (the Owner dangling-link route).
 * On the old code (#26640) the converted dismissal was refused 409 and nothing was voided — the first case fails there.
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
import { registerLiabilitiesRoutes } from "../../liabilities/liabilities.routes.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";

const run = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

run("443.114 AJK-12 — dismissing a fine clears the driver charge in one action", () => {
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
    app = await createIntegrationApp(async (a: FastifyInstance) => {
      await registerSafetyFinesRoutes(a);
      await registerLiabilitiesRoutes(a);
    });
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

  const liabilityState = async (liabilityId: string) =>
    (
      await read<{ voided_at: string | null; status: string }>(
        `SELECT voided_at::text, status FROM driver_finance.driver_liabilities WHERE id = $1::uuid`,
        [liabilityId]
      )
    )[0];
  const deductionVoided = async (deductionId: string) =>
    (await read<{ voided_at: string | null }>(`SELECT voided_at::text FROM driver_finance.driver_settlement_deductions WHERE id = $1::uuid`, [deductionId]))[0]
      ?.voided_at ?? null;
  const fineStatus = async (fineId: string) =>
    (await read<{ status: string }>(`SELECT status FROM safety.civil_fines WHERE id = $1::uuid`, [fineId]))[0]?.status;
  const auditCount = async (eventClass: string, key: string, value: string) =>
    Number(
      (
        await read<{ n: string }>(
          `SELECT count(*)::text AS n FROM audit.audit_events WHERE event_class = $1 AND payload->>$2 = $3`,
          [eventClass, key, value]
        )
      )[0]?.n ?? 0
    );

  it("a converted fine: dismiss voids the liability (deduction voided, receivable reversed) THEN dismisses — one action, audited", async () => {
    const fineId = await newFine(25_000);
    const conv = await convert(fineId);
    expect(conv.statusCode, conv.body).toBe(200);
    const { liability, deduction_id } = conv.json() as { liability: { id: string }; deduction_id: string };
    expect(await receivableNetCents(liability.id)).toBe(25_000);

    const res = await dismiss(fineId);
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as { status: string }).status).toBe("dismissed");
    expect(await fineStatus(fineId)).toBe("dismissed");
    const liab = await liabilityState(liability.id);
    expect(liab.voided_at).not.toBeNull();
    expect(liab.status).toBe("voided");
    expect(await deductionVoided(deduction_id)).not.toBeNull();
    expect(await receivableNetCents(liability.id)).toBe(0);
    expect(await auditCount("safety.fine.dismissed", "fine_id", fineId)).toBe(1);
    expect(await auditCount("liability.voided", "resource_id", liability.id)).toBe(1);
  });

  it("a converted fine: a non-Owner is refused (voiding a driver debt is Owner-only) — nothing changes", async () => {
    const fineId = await newFine(12_000);
    const conv = await convert(fineId);
    const { liability, deduction_id } = conv.json() as { liability: { id: string }; deduction_id: string };
    const res = await dismiss(fineId, "Safety");
    expect(res.statusCode, res.body).toBe(403);
    expect(await fineStatus(fineId)).not.toBe("dismissed");
    expect((await liabilityState(liability.id)).voided_at).toBeNull();
    expect(await deductionVoided(deduction_id)).toBeNull();
    expect(await receivableNetCents(liability.id)).toBe(12_000);
  });

  it("the DB lock refuses converted -> dismissed while the liability is live (direct UPDATE)", async () => {
    const fineId = await newFine(8_000);
    expect((await convert(fineId)).statusCode).toBe(200);
    await expect(
      tx(() => db.query(`UPDATE safety.civil_fines SET status = 'dismissed' WHERE id = $1::uuid`, [fineId]))
    ).rejects.toThrow(/E_FINE_LOCKED_AFTER_CONVERSION/);
  });

  it("a converted fine whose deduction was already recovered through a closed settlement is refused by name — nothing changes", async () => {
    const fineId = await newFine(5_000);
    const conv = await convert(fineId);
    const { liability, deduction_id } = conv.json() as { liability: { id: string }; deduction_id: string };
    const settlementId = randomUUID();
    await tx(async () => {
      await db.query(
        `INSERT INTO driver_finance.driver_settlements
           (id, operating_company_id, display_id, driver_id, period_start, period_end, status, locked_at, gross_pay, deductions_total, reimbursements_total, net_pay, settlement_model)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,CURRENT_DATE-7,CURRENT_DATE,'locked',now(),100,50,0,50,'week_calendar')`,
        [settlementId, companyId, `AJK12-${s}`, driverId]
      );
      await db.query(
        `INSERT INTO driver_finance.settlement_lines (settlement_id, operating_company_id, line_type, description, amount, source_reference_id, is_active)
         VALUES ($1::uuid,$2::uuid,'deduction','fine recovery',-50.00,$3::uuid,true)`,
        [settlementId, companyId, deduction_id]
      );
    });
    const res = await dismiss(fineId);
    expect(res.statusCode, res.body).toBe(409);
    expect((res.json() as { error: string }).error).toBe("driver_receivable_partly_recovered");
    expect(await fineStatus(fineId)).not.toBe("dismissed");
    expect((await liabilityState(liability.id)).voided_at).toBeNull();
    expect(await deductionVoided(deduction_id)).toBeNull();
    expect(await receivableNetCents(liability.id)).toBe(5_000);
  });

  it("an unconverted fine still dismisses (non-Owner allowed as before)", async () => {
    const fineId = await newFine(10_000);
    const res = await dismiss(fineId, "Safety");
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as { status: string }).status).toBe("dismissed");
  });

  describe("Owner route: clear a dangling converted link", () => {
    const clear = (fineId: string, dryRun: boolean | undefined, role = "Owner") =>
      app.inject({
        method: "POST",
        url: `/api/v1/safety/fines/${fineId}/clear-missing-liability-link?operating_company_id=${companyId}`,
        headers: testAuthHeaders(TEST_OWNER_USER_ID, role),
        payload: dryRun === undefined ? {} : { dry_run: dryRun },
      });
    async function danglingFine(): Promise<{ fineId: string; ghost: string }> {
      const fineId = await newFine(7_500);
      const ghost = randomUUID();
      // OLD.converted_to_liability_id IS NULL, so the lock does not fire: this is how a purge leaves the pointer.
      await tx(() => db.query(`UPDATE safety.civil_fines SET converted_to_liability_id = $2::uuid WHERE id = $1::uuid`, [fineId, ghost]));
      return { fineId, ghost };
    }
    const pointer = async (fineId: string) =>
      (await read<{ p: string | null }>(`SELECT converted_to_liability_id::text AS p FROM safety.civil_fines WHERE id = $1::uuid`, [fineId]))[0]?.p ?? null;

    it("dry run (the default) writes nothing; the real run clears only the pointer, audited, status unchanged", async () => {
      const { fineId, ghost } = await danglingFine();
      const dry = await clear(fineId, undefined);
      expect(dry.statusCode, dry.body).toBe(200);
      expect((dry.json() as { dry_run: boolean; cleared_liability_id: string }).dry_run).toBe(true);
      expect(await pointer(fineId)).toBe(ghost);

      const real = await clear(fineId, false);
      expect(real.statusCode, real.body).toBe(200);
      expect(await pointer(fineId)).toBeNull();
      expect(await fineStatus(fineId)).toBe("open");
      expect(await auditCount("safety.fine.dangling_liability_link_cleared", "fine_id", fineId)).toBe(1);
      expect((await clear(fineId, false)).statusCode).toBe(409); // idempotent: nothing left to clear
    });

    it("refuses when the liability exists (route 409 + DB lock on a direct UPDATE)", async () => {
      const fineId = await newFine(6_000);
      const conv = await convert(fineId);
      const { liability } = conv.json() as { liability: { id: string } };
      const res = await clear(fineId, false);
      expect(res.statusCode, res.body).toBe(409);
      expect((res.json() as { error: string }).error).toBe("fine_liability_exists");
      expect(await pointer(fineId)).toBe(liability.id);
      await expect(
        tx(() => db.query(`UPDATE safety.civil_fines SET converted_to_liability_id = NULL WHERE id = $1::uuid`, [fineId]))
      ).rejects.toThrow(/E_FINE_LOCKED_AFTER_CONVERSION/);
    });

    it("a non-Owner is refused 403 and the refusal is audited", async () => {
      const { fineId, ghost } = await danglingFine();
      const res = await clear(fineId, false, "Safety");
      expect(res.statusCode, res.body).toBe(403);
      expect(await pointer(fineId)).toBe(ghost);
      expect(await auditCount("safety.fine.dangling_liability_link_clear_refused_non_owner", "fine_id", fineId)).toBe(1);
    });
  });
});
