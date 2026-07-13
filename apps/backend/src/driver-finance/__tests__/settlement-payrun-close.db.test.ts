/**
 * SETTLEMENT PAY-RUN CLOSE — net-zero + escrow-cap + advance-recovery + flag-gate PROOF (real Postgres).
 * The money-path acceptance for the settlement pay-run (Phase 5). Runs only in CI (GITHUB_ACTIONS=true)
 * against a fully-migrated Postgres. Mirrors the harness/bootstrap of
 * accounting/settlement-posting/__tests__/settlement-bill-payment-posting.db.test.ts.
 *
 *  (1) escrow BELOW cap, flag ON  -> the pay-run JE BALANCES to the cent (sum debits == sum credits); the
 *      escrow credit lands on the driver's OWN Damage-Claim escrow LIABILITY sub-account; the un-recovered
 *      advance is marked recovered EXACTLY ONCE (recovered_in_settlement_id set); the net credits the
 *      payment-method's cash account; exactly ONE driver_finance.payrun_gl_runs anchor row.
 *  (2) escrow AT/OVER the $2,000 cap -> escrow_contribution == 0 (JE still balances).
 *  (3) flag OFF -> preview BALANCES but ZERO rows written to accounting.journal_entries/journal_entry_postings.
 *  (4) maker == checker cash-advance request is REJECTED (DB CHECK backstop); an Owner/authority request
 *      (reviewer NULL) and a distinct maker<>checker request are ALLOWED.
 *  (5) idempotent: a second flag-ON close does NOT double-post (still one JE, advance recovered once).
 */
import crypto, { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID, TEST_ENCRYPTION_KEY } from "../../../test-helpers/constants.js";
import { upsertDriverEscrowAccountLink } from "../../accounting/driver-subaccount-provision.service.js";
import { closeSettlementPayRun } from "../settlement-payrun-close.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

// createJournalEntry unconditionally enqueues a QBO sync job (enqueueSyncJob -> getValidAccessToken) which
// needs an authorized integrations.qbo_connections row whose access_token decrypts under ENCRYPTION_KEY.
// MUST be the shared TEST_ENCRYPTION_KEY (vitest pool:"forks" reuses a child process across files).
process.env.ENCRYPTION_KEY ??= TEST_ENCRYPTION_KEY;
function encryptTestToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(process.env.ENCRYPTION_KEY!, "utf8").digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}

const CAP = 200_000; // ESCROW_CAP_CENTS

describeIntegration("SETTLEMENT PAY-RUN CLOSE net-zero (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  const userId = TEST_OWNER_USER_ID;
  const realm = `PAYRUN-REALM-${suffix}`;

  // shared role-binding target accounts + payment method cash account (created once)
  const acct = {
    driverPay: randomUUID(),
    insuranceRecovery: randomUUID(),
    advanceClearing: randomUUID(),
    chargebackRecovery: randomUUID(),
    cash: randomUUID(),
  };
  const paymentMethodId = randomUUID();
  // per-driver escrow liability sub-accounts (grandparent -> parent -> per-driver leaf)
  const escrowGrandparent = randomUUID();
  const escrowParent = randomUUID();
  // Distinct, non-Faro (<> 1150040084) QBO ids per escrow account: uq_accounts_company_qbo_account_id forbids
  // reuse within a company, and the escrow resolver only requires a Liability that is NOT Faro (never a
  // specific id) — so each account in the Damage-Claim liability family carries its own id, as in prod.
  const escrowQbo = (tag: string) => `1150040187-${suffix}-${tag}`;

  type Scenario = { driverId: string; escrowSub: string; settlementId: string; displayId: string; advanceId?: string; liabilityId?: string };
  const below: Scenario = { driverId: randomUUID(), escrowSub: randomUUID(), settlementId: randomUUID(), displayId: `PR-BELOW-${suffix}` };
  const atcap: Scenario = { driverId: randomUUID(), escrowSub: randomUUID(), settlementId: randomUUID(), displayId: `PR-ATCAP-${suffix}` };
  const off: Scenario = { driverId: randomUUID(), escrowSub: randomUUID(), settlementId: randomUUID(), displayId: `PR-OFF-${suffix}` };
  const mkUser1 = randomUUID();
  const mkUser2 = randomUUID();
  const allDrivers = [below.driverId, atcap.driverId, off.driverId];

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try { await fn(); await db.query("COMMIT"); }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }
  async function read<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try { const r = await db.query(sql, params); await db.query("COMMIT"); return r.rows as T[]; }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }
  async function setFlag(enabled: boolean) {
    await bypass(async () => {
      await db.query(
        `DELETE FROM lib.feature_flag_overrides WHERE flag_key='SETTLEMENT_GL_POSTING_ENABLED' AND operating_company_id=$1::uuid AND user_uuid IS NULL`,
        [companyId]
      );
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ('SETTLEMENT_GL_POSTING_ENABLED', $1::uuid, NULL, $2, $3::uuid)`,
        [companyId, enabled, userId]
      );
    });
  }

  async function mkAcct(id: string, name: string, type: string, parent: string | null, qbo: string | null) {
    await db.query(
      `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, parent_account_id, qbo_account_id, is_postable)
       VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,true)`,
      [id, companyId, `A-${id.slice(0, 8)}`, name, type, parent, qbo]
    );
  }
  async function bind(roleKey: string, accountId: string) {
    await db.query(
      `INSERT INTO catalogs.account_role_bindings (role_key, account_id, operating_company_id)
       VALUES ($1,$2::uuid,$3::uuid)
       ON CONFLICT (role_key) DO UPDATE SET account_id = EXCLUDED.account_id, deactivated_at = NULL, operating_company_id = EXCLUDED.operating_company_id`,
      [roleKey, accountId, companyId]
    );
  }

  /** Seed a driver + its escrow leaf + bridge + a locked settlement (gross 3000). */
  async function seedDriverAndSettlement(s: Scenario, escrowBalanceCents: number) {
    await db.query(
      `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone)
       VALUES ($1::uuid,$2::uuid,'PayRun',$3,$4)`,
      [s.driverId, companyId, `D-${s.displayId}`, `+1006${randomUUID().slice(0, 7)}`]
    );
    await mkAcct(s.escrowSub, `${s.displayId} — Driver Escrow`, "Liability", escrowParent, escrowQbo(s.displayId));
    await upsertDriverEscrowAccountLink(db, { operatingCompanyId: companyId, driverId: s.driverId, coaAccountId: s.escrowSub });
    // running escrow balance (drives the cap check)
    await db.query(
      `INSERT INTO driver_finance.escrow_balances (operating_company_id, driver_id, total_held_cents, current_balance_cents)
       VALUES ($1::uuid,$2::uuid,$3,$3)
       ON CONFLICT (operating_company_id, driver_id) DO UPDATE SET current_balance_cents = EXCLUDED.current_balance_cents, total_held_cents = EXCLUDED.total_held_cents`,
      [companyId, s.driverId, escrowBalanceCents]
    );
    await db.query(
      `INSERT INTO driver_finance.driver_settlements
         (id, operating_company_id, display_id, driver_id, period_start, period_end, status, locked_at, gross_pay, deductions_total, reimbursements_total, net_pay)
       VALUES ($1::uuid,$2::uuid,$3,$4::uuid,CURRENT_DATE-7,CURRENT_DATE,'locked',now(),3000,0,0,0)`,
      [s.settlementId, companyId, s.displayId, s.driverId]
    );
    // a plain 'insurance' deduction (400.00) -> insurance_recovery role
    await db.query(
      `INSERT INTO driver_finance.driver_settlement_deductions
         (operating_company_id, driver_id, deduction_type, amount_cents, reason, applied_to_settlement_id, created_by_user_id)
       VALUES ($1::uuid,$2::uuid,'insurance',$3,'insurance recovery',$4::uuid,$5::uuid)`,
      [companyId, s.driverId, 40000, s.settlementId, userId]
    );
    // an abandonment chargeback line (100.00)
    await db.query(
      `INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount)
       VALUES ($1::uuid,'abandonment_chargeback','abandonment chargeback',-100.00)`,
      [s.settlementId]
    );
    // an un-recovered outstanding advance (200.00) + its liability parent
    s.liabilityId = randomUUID();
    s.advanceId = randomUUID();
    await db.query(
      `INSERT INTO driver_finance.driver_liabilities (id, operating_company_id, driver_id, type, source_description, original_amount, current_balance)
       VALUES ($1::uuid,$2::uuid,$3::uuid,'advance','pay-run advance',200.00,200.00)`,
      [s.liabilityId, companyId, s.driverId]
    );
    await db.query(
      `INSERT INTO driver_finance.driver_advances
         (id, operating_company_id, display_id, driver_id, liability_id, amount, purpose, disbursement_method, disbursement_status, recipient_type, created_by_user_id, status, outstanding_balance)
       VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5::uuid,200.00,'fuel','ach','disbursed','driver',$6::uuid,'outstanding',200.00)`,
      [s.advanceId, companyId, `ADV-${s.displayId}`, s.driverId, s.liabilityId, userId]
    );
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
        `INSERT INTO identity.users (id, email, role, preferred_language) VALUES
           ($1::uuid,$2,'Owner','en'),($3::uuid,$4,'Dispatcher','en'),($5::uuid,$6,'Accountant','en')
         ON CONFLICT (id) DO NOTHING`,
        [userId, `pr-owner-${suffix}@test.local`, mkUser1, `pr-mk-${suffix}@test.local`, mkUser2, `pr-ck-${suffix}@test.local`]
      );
      // shared role-target accounts
      await mkAcct(acct.driverPay, `Driver Pay Expense ${suffix}`, "Expense", null, null);
      await mkAcct(acct.insuranceRecovery, `Insurance Recovery ${suffix}`, "Liability", null, null);
      await mkAcct(acct.advanceClearing, `Advance Clearing ${suffix}`, "Asset", null, null);
      await mkAcct(acct.chargebackRecovery, `Chargeback Recovery ${suffix}`, "Income", null, null);
      await mkAcct(acct.cash, `Operating Cash ${suffix}`, "Asset", null, null);
      await mkAcct(escrowGrandparent, `Damage Claim Escrow ${suffix}`, "Liability", null, escrowQbo("GP"));
      await mkAcct(escrowParent, `Driver Escrow ${suffix}`, "Liability", escrowGrandparent, escrowQbo("P"));
      await bind("driver_pay_expense", acct.driverPay);
      await bind("insurance_recovery", acct.insuranceRecovery);
      await bind("advance_recovery", acct.advanceClearing);
      await bind("abandonment_chargeback_recovery", acct.chargebackRecovery);
      // owner-editable payment method pinned to the cash account
      await db.query(
        // canonical 0152 table is code-keyed (code + display_name), not `name`.
        `INSERT INTO catalogs.payment_methods (id, operating_company_id, code, display_name, gl_account_id, is_active)
         VALUES ($1::uuid,$2::uuid,$3,$4,$5::uuid,true)`,
        [paymentMethodId, companyId, `ACH_${suffix}`, `ACH ${suffix}`, acct.cash]
      );
      await db.query(
        `INSERT INTO integrations.qbo_connections
           (operating_company_id, realm_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, authorized_by_user_id)
         VALUES ($1::uuid,$2,$3,$4, now()+interval '1 year', now()+interval '1 year', $5::uuid)
         ON CONFLICT (operating_company_id, realm_id) WHERE revoked_at IS NULL DO NOTHING`,
        [companyId, realm, encryptTestToken("t"), encryptTestToken("r"), userId]
      );
      await seedDriverAndSettlement(below, 50_000); // below cap -> contributes 25000
      await seedDriverAndSettlement(atcap, CAP);    // at cap    -> contributes 0
      await seedDriverAndSettlement(off, 50_000);   // flag-off preview
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        const sids = [below.settlementId, atcap.settlementId, off.settlementId];
        await db.query(`DELETE FROM driver_finance.payrun_gl_runs WHERE settlement_id = ANY($1::uuid[])`, [sids]);
        await db.query(`DELETE FROM accounting.journal_entry_postings jep USING accounting.journal_entries je
                          WHERE je.id=jep.journal_entry_uuid AND je.operating_company_id=$1::uuid AND je.memo LIKE $2`, [companyId, `Settlement PR-%${suffix}%`]);
        await db.query(`DELETE FROM accounting.journal_entries WHERE operating_company_id=$1::uuid AND memo LIKE $2`, [companyId, `Settlement PR-%${suffix}%`]);
        await db.query(`DELETE FROM driver_finance.settlement_lines WHERE settlement_id = ANY($1::uuid[])`, [sids]);
        await db.query(`DELETE FROM driver_finance.driver_settlement_deductions WHERE applied_to_settlement_id = ANY($1::uuid[])`, [sids]);
        await db.query(`DELETE FROM driver_finance.driver_advances WHERE driver_id = ANY($1::uuid[])`, [allDrivers]);
        await db.query(`DELETE FROM driver_finance.driver_liabilities WHERE driver_id = ANY($1::uuid[])`, [allDrivers]);
        await db.query(`DELETE FROM driver_finance.escrow_ledger WHERE driver_id = ANY($1::uuid[])`, [allDrivers]);
        await db.query(`DELETE FROM driver_finance.escrow_balances WHERE driver_id = ANY($1::uuid[])`, [allDrivers]);
        await db.query(`DELETE FROM driver_finance.cash_advance_requests WHERE driver_id = ANY($1::uuid[])`, [allDrivers]);
        await db.query(`DELETE FROM driver_finance.driver_settlements WHERE id = ANY($1::uuid[])`, [sids]);
        await db.query(`DELETE FROM accounting.escrow_accounts WHERE holder_id = ANY($1::uuid[])`, [allDrivers]);
        await db.query(`DELETE FROM catalogs.payment_methods WHERE id=$1::uuid`, [paymentMethodId]);
        await db.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [allDrivers]);
        await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [
          [below.escrowSub, atcap.escrowSub, off.escrowSub, escrowParent, escrowGrandparent, acct.driverPay, acct.insuranceRecovery, acct.advanceClearing, acct.chargebackRecovery, acct.cash],
        ]);
        await db.query(`DELETE FROM catalogs.account_role_bindings WHERE role_key = ANY($1)`, [["driver_pay_expense", "insurance_recovery", "advance_recovery", "abandonment_chargeback_recovery"]]);
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key='SETTLEMENT_GL_POSTING_ENABLED' AND operating_company_id=$1::uuid`, [companyId]);
        await db.query(`DELETE FROM integrations.qbo_connections WHERE operating_company_id=$1::uuid AND realm_id=$2`, [companyId, realm]);
      });
    } catch { /* best-effort */ } finally { await db.end(); }
  });

  async function jeBalance(jeId: string): Promise<{ dr: number; cr: number }> {
    const rows = await read<{ dr: string; cr: string }>(
      `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='debit'),0)::text AS dr,
              COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='credit'),0)::text AS cr
         FROM accounting.journal_entry_postings WHERE journal_entry_uuid=$1::uuid`,
      [jeId]
    );
    return { dr: Number(rows[0]!.dr), cr: Number(rows[0]!.cr) };
  }

  it("(1) below-cap flag-ON: JE balances to the cent; escrow->driver liability sub; advance recovered once; net->cash", async () => {
    await setFlag(true);
    const res = await closeSettlementPayRun(
      { operatingCompanyId: companyId, settlementId: below.settlementId, paymentMethodId },
      { userId }
    );
    expect(res.result).toBe("posted");
    expect(res.journal_entry_id).toBeTruthy();
    // breakdown: gross 300000, ded 40000, chargeback 10000, advance 20000, escrow 25000, net 205000
    expect(res.breakdown.gross_cents).toBe(300000);
    expect(res.breakdown.deductions_cents).toBe(40000);
    expect(res.breakdown.chargebacks_cents).toBe(10000);
    expect(res.breakdown.advance_recoveries_cents).toBe(20000);
    expect(res.breakdown.escrow_contribution_cents).toBe(25000);
    expect(res.breakdown.net_cents).toBe(205000);

    // JE balances to the cent
    const bal = await jeBalance(res.journal_entry_id!);
    expect(bal.dr).toBe(bal.cr);
    expect(bal.dr).toBe(300000);

    // escrow credit lands on the driver's OWN Damage-Claim liability sub-account (parent set, Liability)
    const esc = await read<{ account_id: string; amount_cents: string; account_type: string; parent: string | null }>(
      `SELECT jep.account_id::text, jep.amount_cents::text, a.account_type, a.parent_account_id::text AS parent
         FROM accounting.journal_entry_postings jep JOIN catalogs.accounts a ON a.id = jep.account_id
        WHERE jep.journal_entry_uuid=$1::uuid AND jep.debit_or_credit='credit' AND jep.account_id=$2::uuid`,
      [res.journal_entry_id, below.escrowSub]
    );
    expect(esc.length).toBe(1);
    expect(Number(esc[0]!.amount_cents)).toBe(25000);
    expect(esc[0]!.account_type).toBe("Liability");
    expect(esc[0]!.parent).toBeTruthy();

    // net credits the payment-method's cash account
    const cash = await read<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents),0)::text AS total FROM accounting.journal_entry_postings
        WHERE journal_entry_uuid=$1::uuid AND debit_or_credit='credit' AND account_id=$2::uuid`,
      [res.journal_entry_id, acct.cash]
    );
    expect(Number(cash[0]!.total)).toBe(205000);

    // advance marked recovered EXACTLY ONCE
    expect(res.recovered_advance_ids).toEqual([below.advanceId]);
    const adv = await read<{ recovered: string | null; status: string }>(
      `SELECT recovered_in_settlement_id::text AS recovered, status FROM driver_finance.driver_advances WHERE id=$1::uuid`,
      [below.advanceId]
    );
    expect(adv[0]!.recovered).toBe(below.settlementId);
    expect(adv[0]!.status).toBe("recovered");

    // exactly ONE payrun_gl_runs anchor
    const runs = await read<{ c: string }>(`SELECT count(*)::text AS c FROM driver_finance.payrun_gl_runs WHERE settlement_id=$1::uuid`, [below.settlementId]);
    expect(Number(runs[0]!.c)).toBe(1);
  });

  it("(1b) idempotent: a second flag-ON close does not double-post (one JE, advance recovered once)", async () => {
    await setFlag(true);
    const res2 = await closeSettlementPayRun(
      { operatingCompanyId: companyId, settlementId: below.settlementId, paymentMethodId },
      { userId }
    );
    expect(res2.result).toBe("posted");
    // no new advances recovered on the re-run (already recovered)
    expect(res2.recovered_advance_ids).toEqual([]);
    const runs = await read<{ c: string }>(`SELECT count(*)::text AS c FROM driver_finance.payrun_gl_runs WHERE settlement_id=$1::uuid`, [below.settlementId]);
    expect(Number(runs[0]!.c)).toBe(1);
    const jes = await read<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entries WHERE operating_company_id=$1::uuid AND memo LIKE $2`,
      [companyId, `Settlement ${below.displayId}%`]
    );
    expect(Number(jes[0]!.c)).toBe(1);
  });

  it("(2) at/over cap: escrow_contribution == 0 and the JE still balances", async () => {
    await setFlag(true);
    const res = await closeSettlementPayRun(
      { operatingCompanyId: companyId, settlementId: atcap.settlementId, paymentMethodId },
      { userId }
    );
    expect(res.result).toBe("posted");
    expect(res.breakdown.escrow_balance_before_cents).toBe(CAP);
    expect(res.breakdown.escrow_contribution_cents).toBe(0);
    // net = 300000 - 40000 - 0 - 20000 - 10000 = 230000
    expect(res.breakdown.net_cents).toBe(230000);
    const bal = await jeBalance(res.journal_entry_id!);
    expect(bal.dr).toBe(bal.cr);
    // no escrow leg on the driver's escrow sub-account
    const esc = await read<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entry_postings WHERE journal_entry_uuid=$1::uuid AND account_id=$2::uuid`,
      [res.journal_entry_id, atcap.escrowSub]
    );
    expect(Number(esc[0]!.c)).toBe(0);
  });

  it("(3) flag OFF: preview balances but ZERO journal entries / postings are written", async () => {
    await setFlag(false);
    const res = await closeSettlementPayRun(
      { operatingCompanyId: companyId, settlementId: off.settlementId, paymentMethodId },
      { userId }
    );
    expect(res.result).toBe("previewed");
    expect(res.posting_enabled).toBe(false);
    expect(res.journal_entry_id).toBeNull();
    // preview legs balance
    const dr = res.je_preview.filter((l) => l.debit_or_credit === "debit").reduce((s, l) => s + l.amount_cents, 0);
    const cr = res.je_preview.filter((l) => l.debit_or_credit === "credit").reduce((s, l) => s + l.amount_cents, 0);
    expect(dr).toBe(cr);
    expect(dr).toBe(300000);
    // NOTHING written
    const jes = await read<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entries WHERE operating_company_id=$1::uuid AND memo LIKE $2`,
      [companyId, `Settlement ${off.displayId}%`]
    );
    expect(Number(jes[0]!.c)).toBe(0);
    const runs = await read<{ c: string }>(`SELECT count(*)::text AS c FROM driver_finance.payrun_gl_runs WHERE settlement_id=$1::uuid`, [off.settlementId]);
    expect(Number(runs[0]!.c)).toBe(0);
    // advance NOT recovered under preview
    const adv = await read<{ recovered: string | null }>(
      `SELECT recovered_in_settlement_id::text AS recovered FROM driver_finance.driver_advances WHERE id=$1::uuid`,
      [off.advanceId]
    );
    expect(adv[0]!.recovered).toBeNull();
  });

  it("(4) maker==checker cash-advance is rejected; authority (reviewer NULL) and distinct maker<>checker allowed", async () => {
    // maker == checker -> DB CHECK rejects
    await expect(
      read(
        `INSERT INTO driver_finance.cash_advance_requests
           (operating_company_id, driver_id, requested_amount_cents, submitted_by_user_id, reviewed_by_user_id)
         VALUES ($1::uuid,$2::uuid,5000,$3::uuid,$3::uuid)`,
        [companyId, below.driverId, mkUser1]
      )
    ).rejects.toThrow(/maker_ne_checker|check/i);
    // Owner/authority auto-approve leaves reviewer NULL -> allowed
    await bypass(async () => {
      await db.query(
        `INSERT INTO driver_finance.cash_advance_requests
           (operating_company_id, driver_id, requested_amount_cents, submitted_by_user_id, reviewed_by_user_id)
         VALUES ($1::uuid,$2::uuid,5000,$3::uuid,NULL)`,
        [companyId, below.driverId, userId]
      );
    });
    // distinct maker <> checker -> allowed
    await bypass(async () => {
      await db.query(
        `INSERT INTO driver_finance.cash_advance_requests
           (operating_company_id, driver_id, requested_amount_cents, submitted_by_user_id, reviewed_by_user_id)
         VALUES ($1::uuid,$2::uuid,5000,$3::uuid,$4::uuid)`,
        [companyId, below.driverId, mkUser1, mkUser2]
      );
    });
    const c = await read<{ c: string }>(`SELECT count(*)::text AS c FROM driver_finance.cash_advance_requests WHERE driver_id=$1::uuid`, [below.driverId]);
    expect(Number(c[0]!.c)).toBe(2);
  });
});
