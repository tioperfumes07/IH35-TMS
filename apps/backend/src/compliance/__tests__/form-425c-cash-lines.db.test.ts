/**
 * MOR (UST Form 425C) court cash lines — REAL Postgres proof (CI only, GITHUB_ACTIONS=true).
 *
 * Proves against a migrated Postgres that the phantom-column repair files the RIGHT numbers on a
 * court document:
 *   (1) NOT SWAPPED — a Plaid-signed deposit (is_credit=true, amount_cents NEGATIVE) lands in RECEIPTS
 *       (line 20) and a payment (is_credit=false, amount_cents positive) lands in DISBURSEMENTS
 *       (line 21). Grouping is on is_credit, magnitude via abs(amount_cents) — so the Plaid sign can
 *       never swap the two lines.
 *   (2) OWN-TRANSFER EXCLUDED — legs flagged review_state='transfer' / transfer_kind / a
 *       destination_bank_account_id are excluded from BOTH receipts and disbursements.
 *   (3) GENUINE owner contribution (a plain credit, not a transfer) remains INCLUDED as a receipt.
 *   (4) VIRTUAL accounts (factoring/escrow, account_type LIKE 'virtual_%') are out of scope and excluded.
 *
 * This test executes the SAME query the court filing uses (computeBankingSummary) — the phantom
 * columns would throw here, which is exactly why the previous mock-only suite missed the defect.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { computeBankingSummary } from "../form-425c.routes.js";
import { buildExhibitA } from "../../reports/form-425c/exhibits/exhibit-a-cash-receipts.js";
import { buildExhibitB } from "../../reports/form-425c/exhibits/exhibit-b-disbursements.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("MOR/425C cash lines — is_credit grouping + own-transfer exclusion (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  const realAcct = randomUUID();
  const virtualAcct = randomUUID();
  const otherAcct = randomUUID(); // transfer destination (own account)
  const txns: string[] = [];
  // Use a far-future, otherwise-empty month so this test never collides with seeded/live data.
  const MONTH = "2099-03";
  const TXN_DATE = "2099-03-15";

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

  // A client whose every query runs RLS-scoped to companyId — this is what the route passes to
  // computeBankingSummary / the exhibit builders.
  const scopedClient = {
    query: async <R = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: R[] }> => {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
      try {
        const r = await db.query(sql, values);
        await db.query("COMMIT");
        return { rows: r.rows as R[] };
      } catch (e) {
        await db.query("ROLLBACK").catch(() => {});
        throw e;
      }
    },
  };

  async function seedTxn(opts: {
    amountCents: number;
    isCredit: boolean;
    bankAccountId?: string;
    description?: string;
    reviewState?: string;
    transferKind?: string | null;
    destinationBankAccountId?: string | null;
  }): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO banking.bank_transactions
           (id, bank_account_id, operating_company_id, transaction_date, amount_cents, is_credit,
            description, review_state, transfer_kind, destination_bank_account_id)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::date,$5,$6,$7,$8,$9,$10)`,
        [
          id,
          opts.bankAccountId ?? realAcct,
          companyId,
          TXN_DATE,
          opts.amountCents,
          opts.isCredit,
          opts.description ?? "test line",
          opts.reviewState ?? "for_review",
          opts.transferKind ?? null,
          opts.destinationBankAccountId ?? null,
        ]
      );
    });
    txns.push(id);
    return id;
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
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, account_type, account_mask)
         VALUES ($1::uuid,$2::uuid,$3,'checking','3500')`,
        [realAcct, companyId, `MOR Real ${suffix}`]
      );
      await db.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, account_type, account_mask)
         VALUES ($1::uuid,$2::uuid,$3,'checking','9000')`,
        [otherAcct, companyId, `MOR Other ${suffix}`]
      );
      await db.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, account_type, account_mask)
         VALUES ($1::uuid,$2::uuid,$3,'virtual_factoring','0001')`,
        [virtualAcct, companyId, `MOR Virtual ${suffix}`]
      );
    });

    // Real receipts (money IN). Plaid convention: is_credit=true stored NEGATIVE.
    await seedTxn({ amountCents: -150000, isCredit: true, description: "Customer deposit" }); // $1,500.00
    await seedTxn({ amountCents: -500000, isCredit: true, description: "Owner contribution" }); // $5,000.00 — INCLUDED
    // Real disbursement (money OUT). is_credit=false stored POSITIVE.
    await seedTxn({ amountCents: 42050, isCredit: false, description: "Fuel payment" }); // $420.50
    // Own-transfers — must be excluded from BOTH lines (three distinct signals).
    await seedTxn({ amountCents: 99999, isCredit: false, description: "xfer via review_state", reviewState: "transfer" });
    await seedTxn({ amountCents: -88888, isCredit: true, description: "xfer via transfer_kind", transferKind: "in" });
    await seedTxn({ amountCents: 77777, isCredit: false, description: "xfer via destination", destinationBankAccountId: otherAcct });
    // Virtual account (factoring) — excluded by account_type NOT LIKE 'virtual_%'.
    await seedTxn({ amountCents: -1000000, isCredit: true, description: "factoring reserve", bankAccountId: virtualAcct });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        if (txns.length) await db.query(`DELETE FROM banking.bank_transactions WHERE id = ANY($1::uuid[])`, [txns]);
        await db.query(`DELETE FROM banking.bank_accounts WHERE id = ANY($1::uuid[])`, [[realAcct, otherAcct, virtualAcct]]);
      });
    } finally {
      await db.end();
    }
  });

  it("lines 20/21 are NOT swapped, own-transfers + virtual accounts excluded", async () => {
    const summary = await computeBankingSummary(scopedClient, companyId, MONTH);
    // Receipts = $1,500.00 deposit + $5,000.00 owner contribution = $6,500.00 (transfers/virtual excluded).
    expect(summary.line_20_receipts).toBeCloseTo(6500, 2);
    // Disbursements = $420.50 only (the transfer legs at 999.99/777.77 are excluded).
    expect(summary.line_21_disbursements).toBeCloseTo(420.5, 2);
    expect(summary.line_22_net_cash_flow).toBeCloseTo(6079.5, 2);
  });

  it("Exhibit A (receipts) and Exhibit B (disbursements) use the same is_credit grouping", async () => {
    const [a, b] = await Promise.all([
      buildExhibitA(scopedClient, { operating_company_id: companyId, period_start: "2099-03-01", period_end: "2099-03-31" }),
      buildExhibitB(scopedClient, { operating_company_id: companyId, period_start: "2099-03-01", period_end: "2099-03-31" }),
    ]);
    expect(a.total_cents).toBe(650000); // $6,500.00 in cents — receipts, not swapped
    expect(b.total_cents).toBe(42050); // $420.50 — disbursements only, transfers excluded
  });
});
