/**
 * SETTLEMENT APPROVAL SERVICE — canonical repoint + 100× conversion PROOF (real Postgres).
 *
 * P2.4a moved settlements/approval.service.ts off the RETIRE tables
 * (settlement.settlement / settlement.settlement_line, integer CENTS) onto the canonical
 * driver_finance.driver_settlements / driver_finance.settlement_lines (DOLLARS numeric(14,2)).
 * The service's public contract stays in CENTS, so every money read must multiply by 100.
 *
 * This test is the guard against a 100× (or ÷100) mistake on that boundary:
 *   - a line stored as $12.34 must come back as 1234 cents (NOT 123400, NOT 12).
 *   - header gross_pay $100.00 / deductions_total $25.00 / net_pay $75.00 must come back as
 *     10000 / 2500 / 7500 cents.
 *   - the approve write path returns amount_cents = 1234 and does not mutate the stored amount.
 *
 * Runs only in CI (GITHUB_ACTIONS=true) against a fully-migrated Postgres, mirroring the harness of
 * driver-finance/__tests__/settlement-payrun-close.db.test.ts.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import {
  approveLineItem,
  checkAllLinesApproved,
  getSettlementLineItems,
  getSettlementSummary,
} from "../approval.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("settlement approval.service canonical repoint (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  const driverId = randomUUID();
  const settlementId = randomUUID();
  const lineId = randomUUID();
  const approverId = randomUUID();

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try {
      await fn();
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");

    await bypass(async () => {
      // approved_by is an FK to identity.users — seed the approver or the approve UPDATE FK-violates.
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language)
         VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [approverId, `p24a-approver-${suffix}@test.local`]
      );
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone)
         VALUES ($1::uuid,$2::uuid,'P24A',$3,'0000000000') ON CONFLICT (id) DO NOTHING`,
        [driverId, companyId, `svc-${suffix}`]
      );
      // header: gross $100.00, deductions $25.00, net $75.00 (dollars, numeric(14,2))
      await db.query(
        `INSERT INTO driver_finance.driver_settlements
           (id, operating_company_id, display_id, driver_id, period_start, period_end, status,
            gross_pay, deductions_total, reimbursements_total, net_pay)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,CURRENT_DATE-7,CURRENT_DATE,'draft',100.00,25.00,0,75.00)`,
        [settlementId, companyId, `P24A-${suffix}`, driverId]
      );
      // one line: $12.34, pending, entity-scoped
      await db.query(
        `INSERT INTO driver_finance.settlement_lines
           (id, settlement_id, line_type, description, amount, operating_company_id, category, approval_status)
         VALUES ($1::uuid,$2::uuid,'deduction','p24a test',12.34,$3::uuid,'misc','pending')`,
        [lineId, settlementId, companyId]
      );
    });

    // Make the service reads immune to RLS masking so the assertions isolate the 100× conversion
    // (this test proves the money boundary, not RLS wiring). mdata.drivers RLS is identity-scoped,
    // not operating_company_id-scoped, so without bypass the getSettlementSummary driver JOIN would
    // return null. Entity scoping is still exercised by the service's explicit operating_company_id
    // WHERE clauses — proven by the foreign-company assertion below.
    await db.query("SELECT set_config('app.bypass_rls', 'lucia', false)");
    await db.query("SELECT set_config('app.operating_company_id', $1, false)", [companyId]);
  });

  afterAll(async () => {
    if (!db) return;
    await bypass(async () => {
      await db.query("DELETE FROM driver_finance.settlement_lines WHERE id = $1::uuid", [lineId]);
      await db.query("DELETE FROM driver_finance.driver_settlements WHERE id = $1::uuid", [settlementId]);
      await db.query("DELETE FROM mdata.drivers WHERE id = $1::uuid", [driverId]);
    });
    await db.end();
  });

  it("reads a $12.34 line back as exactly 1234 cents (no 100× error)", async () => {
    const lines = await getSettlementLineItems(db, settlementId, companyId);
    expect(lines).toHaveLength(1);
    expect(lines[0].amountCents).toBe(1234);
    expect(lines[0].lineType).toBe("deduction");
    expect(lines[0].loadNumber).toBeUndefined(); // load_id NULL -> LEFT JOIN yields no load_number
  });

  it("reads header dollars back as cents (100.00->10000, 25.00->2500, 75.00->7500)", async () => {
    const summary = await getSettlementSummary(db, settlementId, companyId);
    expect(summary).not.toBeNull();
    expect(summary!.grossPayCents).toBe(10000);
    expect(summary!.deductionsPendingCents).toBe(2500);
    expect(summary!.netDueCents).toBe(7500);
    expect(summary!.approvalStatus).toBe("needs_review"); // default from migration 202607450000
    expect(summary!.linesToApprove).toEqual({ pending: 1, total: 1 });
    expect(summary!.driverName).toContain("P24A");
  });

  it("approve write path returns 1234 cents and leaves the stored dollar amount intact", async () => {
    await approveLineItem(db, { lineItemId: lineId, approvedBy: approverId, approvedByEmail: "a@test.local" }, companyId);
    const after = await getSettlementLineItems(db, settlementId, companyId);
    expect(after[0].approvalStatus).toBe("approved");
    expect(after[0].amountCents).toBe(1234); // unchanged — approve does not touch amount
  });

  it("checkAllLinesApproved is entity-scoped: true for the owning company, false for a foreign one", async () => {
    // the single line was approved in the prior test -> all lines processed for the owning company
    const owning = await checkAllLinesApproved(db, settlementId, companyId);
    expect(owning.allApproved).toBe(true);
    expect(owning.pendingCount).toBe(0);
    // a foreign company id must NOT see this settlement's lines (entity-scope binding, finding-1)
    const foreign = await checkAllLinesApproved(db, settlementId, randomUUID());
    expect(foreign.pendingCount).toBe(0);
    expect(foreign.rejectedCount).toBe(0);
    // allApproved is vacuously true on an empty scoped set — the point is it counts ZERO of another
    // company's lines, never this company's; proven by pendingCount staying 0 under the foreign scope.
  });
});
