/**
 * SETTLEMENT-BILL-PAYMENT — the canonical driver-settlement GL posting engine (real Postgres).
 * Proves the blueprint §3 worked example end-to-end:
 *   (a) flag OFF -> NO-OP (no gl_run, no bills, no journal entries).
 *   (b) happy path -> a settlement over 3 per-load bills produces:
 *        • 3 accounting.bills numbered by load#, vendor = the driver-vendor, each GL-posted
 *          Dr "Cost of Labor–Mexico Drivers" / Cr A/P;
 *        • advance recovery credits the DRIVER'S OWN Cash-Advance ASSET sub-account, escrow withhold
 *          credits the DRIVER'S OWN Driver-Escrow LIABILITY sub-account (Dr A/P / Cr driver subs),
 *          pay-first-then-escrow;
 *        • a net BillPayment to Wells Fargo — DIP (Dr A/P / Cr DIP);
 *        • the whole thing balances: GL A/P nets to ZERO; every bill closes in the subledger;
 *        • the non-cash deduction bill_payment is flagged + NOT independently GL-posted.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import crypto, { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { TEST_ENCRYPTION_KEY } from "../../../../test-helpers/constants.js";
import { postSettlementBillPayment, reverseSettlementBillPayment, type SettlementBillPaymentResult } from "../settlement-bill-payment-posting.service.js";
import { upsertDriverEscrowAccountLink, upsertDriverAdvanceAccountLink } from "../../driver-subaccount-provision.service.js";
import { companyBusinessDate } from "../../../lib/company-business-date.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

// createBill/payBill enqueue a QBO sync job which reads an authorized integrations.qbo_connections row
// and decrypts its access_token (qbo-oauth.service.ts encryptToken/decryptToken: AES-256-GCM, key =
// sha256(ENCRYPTION_KEY), value = "<iv>.<tag>.<cipher>" base64). No test in this suite exercises that
// path yet, so ENCRYPTION_KEY is not otherwise required in CI — set a deterministic test-only default.
// MUST be the shared TEST_ENCRYPTION_KEY constant, not a file-local literal: vitest's `pool: "forks"`
// can reuse one child process across multiple `.db.test.ts` files, and getActiveConnectionByCompany has
// no realm_id filter (picks the single latest `authorized_at` row per company) — a second file's
// connection row can otherwise get decrypted with a different process-wide key than it was encrypted
// with (see test-helpers/constants.ts).
process.env.ENCRYPTION_KEY ??= TEST_ENCRYPTION_KEY;
function encryptTestToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(process.env.ENCRYPTION_KEY!, "utf8").digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

describeIntegration("SETTLEMENT-BILL-PAYMENT GL posting (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  // Dedicated, UNIQUE actor for THIS file only (see setFlag). Must differ from every other suite that
  // toggles SETTLEMENT_GL_POSTING_ENABLED on the shared TRANSP company (settlement-gl-posting,
  // settlement-payrun-close) so their user-scoped overrides never share this file's (flag_key, user_uuid).
  const userId = "00000000-0000-4000-8000-0000000000d2";

  const acct = {
    ap: randomUUID(),
    driverPay: randomUUID(),
    dipCash: randomUUID(),
    advanceParent: randomUUID(),
    escrowGrandparent: randomUUID(),
    escrowParent: randomUUID(),
    advanceSub: randomUUID(),
    escrowSub: randomUUID(),
  };
  const dipBankId = randomUUID();
  const customerId = randomUUID();
  const driverId = randomUUID();
  const driverVendorId = `VND-${suffix}`;
  const loadIds = [randomUUID(), randomUUID(), randomUUID()];
  const loadNumbers = [`L-${suffix}-1`, `L-${suffix}-2`, `L-${suffix}-3`];
  const billIds = [randomUUID(), randomUUID(), randomUUID()];
  const grossCents = [52500, 48000, 51000]; // 1,515.00 total
  const advanceCents = 20000;
  const escrowCents = 7500; // total deductions 275.00 -> net 1,240.00
  let settlementId = "";

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
  // createBill assigns its OWN id (gen_random_uuid() default) — it is NEVER the same id as the
  // driver_finance.driver_bills row (billIds, seeded above). The real accounting.bills / bill_payments
  // ids must be resolved via the connectivity link table (settlement -> driver_bill -> accounting.bill),
  // keyed by settlementId so it works regardless of which test/afterAll calls it.
  async function resolveGlBillIds(): Promise<string[]> {
    const rows = await read<{ accounting_bill_id: string }>(
      `SELECT accounting_bill_id::text FROM driver_finance.driver_settlement_gl_bills WHERE settlement_id=$1::uuid`,
      [settlementId]
    );
    return rows.map((r) => r.accounting_bill_id);
  }
  // Every accounting.journal_entry this run posted (3x per-load bill JE + 3x cash bill-payment JE + the
  // 1 deduction JE). NOTE: this shared TRANSP company's ap_control / cash_dip roles are SINGLE mutable
  // slots (accounting.chart_of_accounts_roles / catalogs.account_role_bindings) that sibling
  // real-Postgres suites (e.g. bill-gl-posting.db.test.ts, bill-payment-gl-posting.db.test.ts) also
  // point at their OWN account under vitest's parallel db-test execution. Whichever suite's upsert
  // "wins" the race at any instant, ALL concurrently-running posts resolve the role fresh and can land
  // their legs on THIS account — summing every journal_entry_postings row for (company, account) picks
  // up that cross-test noise. Scoping to just the journal_entry_uuid values THIS test created makes the
  // assertion immune to that race — it is now read as "does the leg of the JEs I posted net correctly",
  // never "does the whole company's account net correctly right now" (see auto-memory
  // shared-company-db-test-contamination).
  async function resolveOwnJournalEntryIds(): Promise<string[]> {
    const rows = await read<{ je_id: string | null }>(
      `SELECT bill_journal_entry_id::text AS je_id FROM driver_finance.driver_settlement_gl_bills WHERE settlement_id=$1::uuid
       UNION
       SELECT cash_journal_entry_id::text AS je_id FROM driver_finance.driver_settlement_gl_bills WHERE settlement_id=$1::uuid
       UNION
       SELECT deduction_journal_entry_id::text AS je_id FROM driver_finance.driver_settlement_gl_runs WHERE settlement_id=$1::uuid`,
      [settlementId]
    );
    return rows.map((r) => r.je_id).filter((id): id is string => Boolean(id));
  }
  async function resolveReversalJournalEntryIds(originalJeIds: string[]): Promise<string[]> {
    if (originalJeIds.length === 0) return [];
    const rows = await read<{ je_id: string }>(
      `SELECT DISTINCT rev.journal_entry_uuid::text AS je_id
         FROM accounting.journal_entry_postings orig
         JOIN accounting.journal_entry_postings rev ON rev.reversal_of_line_id = orig.id
        WHERE orig.journal_entry_uuid = ANY($1::uuid[])
       UNION
       SELECT DISTINCT rev.journal_entry_uuid::text AS je_id
         FROM accounting.transaction_source_links tsl
         JOIN accounting.journal_entry_postings rev ON rev.id = tsl.journal_entry_posting_id
        WHERE tsl.operating_company_id=$2::uuid
          AND tsl.linked_object_type='journal_entry'
          AND tsl.linked_object_id = ANY($3::text[])
          AND tsl.relationship_role='reversal_of'`,
      [originalJeIds, companyId, originalJeIds]
    );
    return rows.map((r) => r.je_id);
  }
  // FLAKE FIX: USER-scoped override (user_uuid = this file's UNIQUE actor), NOT tenant-scoped. The shared
  // TRANSP company (ensureIntegrationPrerequisites) is handed to every integration test, so a tenant-scoped
  // SETTLEMENT_GL_POSTING_ENABLED override on it is clobberable by a parallel sibling suite toggling the same
  // flag on that company (settlement-gl-posting) in the window before postSettlementBillPayment reads it.
  // resolveFlagEnabled checks the USER override BEFORE the tenant override, and postSettlementBillPayment
  // resolves the flag with user_uuid=actor.userId, so a user-scoped row for this file's dedicated actor is
  // immune to cross-file tenant contention. Carries operating_company_id so afterAll cleanup still removes it.
  async function setFlag(enabled: boolean) {
    await bypass(async () => {
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ('SETTLEMENT_GL_POSTING_ENABLED', $1::uuid, $2::uuid, $3, $2::uuid)
         ON CONFLICT (flag_key, user_uuid) WHERE user_uuid IS NOT NULL DO UPDATE SET enabled = EXCLUDED.enabled`,
        [companyId, userId, enabled]
      );
    });
  }

  async function seedSettlement() {
    settlementId = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO driver_finance.driver_settlements
           (id, operating_company_id, display_id, driver_id, period_start, period_end, status, locked_at,
            gross_pay, deductions_total, reimbursements_total, net_pay)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,CURRENT_DATE-7,CURRENT_DATE,'locked',now(),1515,275,0,1240)`,
        [settlementId, companyId, `S-${suffix}`, driverId]
      );
      for (let i = 0; i < 3; i += 1) {
        await db.query(
          `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, status, rate_total_cents, dispatcher_user_id, id)
           VALUES ($1::uuid,$2,$3::uuid,'delivered_pending_docs',$4,$5::uuid,$6::uuid)`,
          [companyId, loadNumbers[i], customerId, grossCents[i]! * 3, userId, loadIds[i]]
        );
        await db.query(
          `INSERT INTO driver_finance.driver_bills
             (id, operating_company_id, load_id, load_number, bill_number, driver_id, gross_amount_cents, status, settled_in_settlement_id)
           VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::uuid,$7,'open',$8::uuid)`,
          [billIds[i], companyId, loadIds[i], loadNumbers[i], `DB-${suffix}-${i}`, driverId, grossCents[i], settlementId]
        );
      }
      // advance recovery (-> driver's OWN cash-advance asset) + escrow withhold (-> driver's OWN escrow liab)
      await db.query(
        `INSERT INTO driver_finance.driver_settlement_deductions
           (operating_company_id, driver_id, deduction_type, amount_cents, reason, status, applied_to_settlement_id, created_by_user_id)
         VALUES ($1::uuid,$2::uuid,'cash_advance_repayment',$3,'advance recovery','applied',$4::uuid,$5::uuid),
                ($1::uuid,$2::uuid,'driver_bond',$6,'escrow withhold','applied',$4::uuid,$5::uuid)`,
        [companyId, driverId, advanceCents, settlementId, userId, escrowCents]
      );
    });
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
        [userId, `sbp-${suffix}@test.local`]
      );
      // Grant the dedicated actor company access — postSettlementBillPayment runs under the actor's own user session (userId).
      await db.query(
        `INSERT INTO org.user_company_access (user_id, company_id) VALUES ($1::uuid,$2::uuid) ON CONFLICT (user_id, company_id) DO NOTHING`,
        [userId, companyId]
      );
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`,
        [customerId, companyId, `SBP Cust ${suffix}`]
      );
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone, qbo_vendor_id)
         VALUES ($1::uuid,$2::uuid,'Mecor','Perez',$3,$4)`,
        [driverId, companyId, `+1004${randomUUID().slice(0, 7)}`, driverVendorId]
      );
      const mkAcct = async (id: string, name: string, type: string, subtype: string | null, parent: string | null) =>
        db.query(
          `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, account_subtype, parent_account_id, is_postable)
           VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,true)`,
          // account_number must be unique per (company, account_number) — derive it from the account id
          // so parent + sub-account never collide (uq_accounts_company_account_number).
          [id, companyId, `A-${id.slice(0, 8)}`, name, type, subtype, parent]
        );
      await mkAcct(acct.ap, `AP ${suffix}`, "Liability", "AccountsPayable", null);
      await mkAcct(acct.driverPay, "Cost of Labor–Mexico Drivers", "Expense", null, null);
      await mkAcct(acct.dipCash, `Wells Fargo — DIP ${suffix}`, "Asset", "Checking", null);
      await mkAcct(acct.advanceParent, "Driver Cash Advance", "Asset", null, null);
      // Two-level escrow nesting (STOP-DECISION #1, year-agnostic): top-level "Damage Claim Escrow"
      // grandparent -> year-agnostic "Driver Escrow" sub-parent -> per-driver leaf "<Name> — Driver
      // Escrow (hired MM/DD/YYYY)". The driver fixture below has no hire_date -> leaf reads "(hired unknown)".
      await mkAcct(acct.escrowGrandparent, "Damage Claim Escrow", "Liability", null, null);
      await mkAcct(acct.escrowParent, "Driver Escrow", "Liability", null, acct.escrowGrandparent);
      await mkAcct(acct.advanceSub, "Driver Cash Advance- Mecor Perez", "Asset", null, acct.advanceParent);
      await mkAcct(acct.escrowSub, "Mecor Perez — Driver Escrow (hired unknown)", "Liability", null, acct.escrowParent);

      // Wire the driver -> per-driver sub-account BRIDGES exactly as the #2136 foundation does on hire
      // (upsertDriverEscrowAccountLink / upsertDriverAdvanceAccountLink). This is what makes the fixture
      // TRUE to production: resolveDriverOwnAccount(kind="escrow") resolves via accounting.escrow_accounts
      // FIRST (holder_type='driver', holder_id=<driver>, coa_account_id=<escrow leaf>) — a deterministic,
      // driver-keyed lookup — and only falls back to the canonical NAME path when no bridge row exists.
      // The migrated TRANSP chart already carries a top-level "Damage Claim Escrow" (QBO-1150040187) with
      // no "Driver Escrow" sub-parent; since resolveCanonicalParentAccount picks the OLDEST match, that
      // seeded grandparent shadowed the fixture's grandparent and the name path returned null ("no
      // provisioned Driver-Escrow sub-account"). The escrow bridge below is the production resolution path
      // and sidesteps that shadowing entirely. The symmetric advance link is stored for fidelity (both
      // links are provisioned on hire; the ASSET sub-account itself resolves by its stable name).
      await upsertDriverEscrowAccountLink(db, { operatingCompanyId: companyId, driverId, coaAccountId: acct.escrowSub });
      await upsertDriverAdvanceAccountLink(db, { operatingCompanyId: companyId, driverId, coaAccountId: acct.advanceSub, actorUserId: userId });

      // The shared fixture company (ensureIntegrationPrerequisites) may already carry an active
      // 'ap_control' role — seeded by a BLOCK-00 migration or a sibling real-Postgres suite
      // (e.g. bill-payment-gl-posting.db.test.ts) that does NOT clean it up. A bare INSERT collides
      // with the partial-unique index uq_coa_roles_company_role_active. Upsert instead so the seed is
      // idempotent AND pins ap_control to THIS suite's acct.ap (the assertions below resolve the A/P
      // account via the service's ap_control lookup and check it equals acct.ap), matching the
      // ON CONFLICT pattern the sibling suites already use.
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid,'ap_control',$2::uuid,true)
         ON CONFLICT (operating_company_id, role) WHERE is_active = true
           DO UPDATE SET account_id = EXCLUDED.account_id, updated_at = now()`,
        [companyId, acct.ap]
      );
      const bind = async (roleKey: string, accountId: string) =>
        db.query(
          `INSERT INTO catalogs.account_role_bindings (role_key, account_id, operating_company_id)
           VALUES ($1,$2::uuid,$3::uuid)
           ON CONFLICT (role_key) DO UPDATE SET account_id = EXCLUDED.account_id, deactivated_at = NULL, operating_company_id = EXCLUDED.operating_company_id`,
          [roleKey, accountId, companyId]
        );
      await bind("driver_pay_expense", acct.driverPay);
      await bind("cash_dip", acct.dipCash);

      await db.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, account_type, ledger_account_id, current_balance_cents)
         VALUES ($1::uuid,$2::uuid,'Wells Fargo — DIP','depository',$3::uuid,10000000)`,
        [dipBankId, companyId, acct.dipCash]
      );
      // createBill/payBill enqueue a QBO sync job (enqueueSyncJob -> getValidAccessToken) even though the
      // JE-push flag itself stays OFF — an authorized connection must exist per-company or it throws "QBO
      // not authorized". Seed a long-lived fake connection so the real posting spine can run end-to-end
      // (matches the pattern other real-Postgres tests avoid by not calling createBill directly).
      await db.query(
        `INSERT INTO integrations.qbo_connections
           (operating_company_id, realm_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, authorized_by_user_id)
         VALUES ($1::uuid, $2, $3, $4, now() + interval '1 year', now() + interval '1 year', $5::uuid)
         ON CONFLICT (operating_company_id, realm_id) WHERE revoked_at IS NULL DO NOTHING`,
        [companyId, `TEST-REALM-${suffix}`, encryptTestToken("test-access-token"), encryptTestToken("test-refresh-token"), userId]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      // Resolve BEFORE the cleanup transaction (resolveGlBillIds/read run their own BEGIN/COMMIT — must
      // not nest inside the bypass() transaction below).
      const glBillIds = settlementId ? await resolveGlBillIds() : [];
      const originalJeIds = settlementId ? await resolveOwnJournalEntryIds() : [];
      const reversalJeIds = settlementId ? await resolveReversalJournalEntryIds(originalJeIds) : [];
      await db.query("SELECT pg_advisory_lock(4200000001)");
      await bypass(async () => {
        await db.query(`DELETE FROM driver_finance.driver_settlement_gl_bills WHERE settlement_id = $1::uuid`, [settlementId]);
        await db.query(`DELETE FROM driver_finance.driver_settlement_gl_runs WHERE settlement_id = $1::uuid`, [settlementId]);
        // 'journal_entry' covers the deduction JE's own link row (distinct from the per-bill 'bill'/
        // 'bill_payment' links) — omitting it left an orphaned transaction_source_links row FK-blocking
        // the journal_entry_postings delete below on any second run against the same fixture company.
        await db.query(`DELETE FROM accounting.transaction_source_links WHERE operating_company_id=$1::uuid AND linked_object_type IN ('bill','bill_payment','journal_entry')`, [companyId]);
        await db.query(`DELETE FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid AND source_transaction_type IN ('bill','bill_payment')`, [companyId]);
        await db.query(`DELETE FROM accounting.posting_batches WHERE operating_company_id=$1::uuid`, [companyId]);
        await db.query(`DELETE FROM accounting.bill_payments WHERE operating_company_id=$1::uuid AND bill_id = ANY($2::uuid[])`, [companyId, glBillIds]);
        await db.query(`DELETE FROM accounting.bill_lines WHERE bill_id = ANY($1::uuid[])`, [glBillIds]);
        // the deduction JE has no source_transaction_type='bill*'; delete via memo match
        await db.query(`DELETE FROM accounting.journal_entry_postings jep USING accounting.journal_entries je WHERE je.id=jep.journal_entry_uuid AND je.operating_company_id=$1::uuid AND je.memo LIKE $2`, [companyId, `Settlement S-${suffix}%`]);
        await db.query(`DELETE FROM accounting.journal_entry_postings WHERE journal_entry_uuid = ANY($1::uuid[])`, [reversalJeIds]);
        await db.query(`DELETE FROM accounting.journal_entries WHERE id = ANY($1::uuid[])`, [reversalJeIds]);
        await db.query(`DELETE FROM accounting.journal_entries WHERE operating_company_id=$1::uuid AND (memo LIKE $2 OR memo LIKE $3)`, [companyId, `%S-${suffix}%`, `%Bill %`]);
        await db.query(`DELETE FROM accounting.bills WHERE operating_company_id=$1::uuid AND id = ANY($2::uuid[])`, [companyId, glBillIds]);
        await db.query(`DELETE FROM driver_finance.driver_settlement_deductions WHERE applied_to_settlement_id = $1::uuid`, [settlementId]);
        await db.query(`DELETE FROM driver_finance.driver_bills WHERE operating_company_id=$1::uuid AND driver_id=$2::uuid`, [companyId, driverId]);
        await db.query(`DELETE FROM driver_finance.driver_settlements WHERE id = $1::uuid`, [settlementId]);
        // mdata.loads has no DELETE RLS policy (FORCE RLS, void-not-delete architecture) — a hard DELETE
        // here is a guaranteed no-op even under bypass_rls='lucia'; harmless (load_number is uniquely
        // suffixed per run so it never collides), left as documentation rather than removed.
        await db.query(`DELETE FROM mdata.loads WHERE id = ANY($1::uuid[])`, [loadIds]);
        await db.query(`DELETE FROM banking.bank_accounts WHERE id = $1::uuid`, [dipBankId]);
        await db.query(`DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id=$1::uuid AND role='ap_control'`, [companyId]);
        // catalogs.account_role_bindings likewise has no DELETE RLS policy -> also a guaranteed no-op.
        // Its 2 rows (driver_pay_expense/cash_dip) are GLOBAL singletons anyway (UNIQUE on role_key alone)
        // upserted by the next run's bind() (ON CONFLICT (role_key) DO UPDATE) — never meant to be deleted
        // per-run. Their target accounts (driverPay/dipCash) are therefore excluded from the accounts
        // delete below (FK-referenced by this un-deletable row) and are intentionally left as reused
        // shared fixture accounts, not per-run garbage.
        await db.query(`DELETE FROM catalogs.account_role_bindings WHERE role_key = ANY($1)`, [["driver_pay_expense", "cash_dip"]]);
        await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [
          Object.entries(acct)
            .filter(([key]) => key !== "driverPay" && key !== "dipCash")
            .map(([, id]) => id),
        ]);
        await db.query(`DELETE FROM mdata.drivers WHERE id = $1::uuid`, [driverId]);
        await db.query(`DELETE FROM mdata.customers WHERE id = $1::uuid`, [customerId]);
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key='SETTLEMENT_GL_POSTING_ENABLED' AND operating_company_id=$1::uuid`, [companyId]);
        await db.query(`DELETE FROM org.user_company_access WHERE user_id=$1::uuid AND company_id=$2::uuid`, [userId, companyId]);
        await db.query(`DELETE FROM integrations.qbo_sync_queue WHERE operating_company_id=$1::uuid AND entity_id = ANY($2::uuid[])`, [companyId, glBillIds]);
        await db.query(`DELETE FROM integrations.qbo_connections WHERE operating_company_id=$1::uuid AND realm_id=$2`, [companyId, `TEST-REALM-${suffix}`]);
      });
    } catch { /* best-effort */ } finally { await db.query("SELECT pg_advisory_unlock(4200000001)").catch(() => {}); }
    await db.end();
  });

  it("(a) flag OFF -> no-op, no run / bills / journal entries", async () => {
    await setFlag(false);
    await seedSettlement();
    const result = (await postSettlementBillPayment({ operatingCompanyId: companyId, settlementId }, { userId })) as SettlementBillPaymentResult;
    expect(result.result).toBe("skipped_flag_off");
    const runs = await read<{ c: string }>(`SELECT count(*)::text AS c FROM driver_finance.driver_settlement_gl_runs WHERE settlement_id=$1::uuid`, [settlementId]);
    expect(Number(runs[0]!.c)).toBe(0);
  });

  it("(b) blueprint worked example: 3 per-load bills, driver-own sub-accounts, net to DIP, A/P nets to 0", async () => {
    await setFlag(true);
    const result = await (async () => {
      await db.query("SELECT pg_advisory_lock(4200000001)");
      try {
        await bypass(async () => {
          await db.query(
            `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
             VALUES ($1::uuid, 'ap_control', $2::uuid, true)
             ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE SET account_id = EXCLUDED.account_id`,
            [companyId, acct.ap]
          );
        });
        return await postSettlementBillPayment({ operatingCompanyId: companyId, settlementId }, { userId });
      } finally {
        await db.query("SELECT pg_advisory_unlock(4200000001)");
      }
    })() as Extract<SettlementBillPaymentResult, { result: "posted" }>;
    expect(result.result).toBe("posted");
    expect(result.bill_count).toBe(3);
    expect(result.gross_cents).toBe(151500);
    expect(result.deductions_cents).toBe(27500);
    expect(result.net_cents).toBe(124000);

    // 3 accounting.bills numbered by load#, vendor = the driver-vendor, each fully paid. createBill
    // assigns its own id (never = the driver_finance.driver_bills id) — resolve via the gl_bills link.
    const glBillIds = await resolveGlBillIds();
    expect(glBillIds.length).toBe(3);
    const bills = await read<{ bill_number: string; vendor_id: string; amount_cents: string; paid_cents: string }>(
      `SELECT bill_number, vendor_id, amount_cents::text, paid_cents::text FROM accounting.bills WHERE id = ANY($1::uuid[]) ORDER BY amount_cents DESC`,
      [glBillIds]
    );
    expect(bills.length).toBe(3);
    expect(new Set(bills.map((b) => b.bill_number))).toEqual(new Set(loadNumbers));
    for (const b of bills) {
      expect(b.vendor_id).toBe(driverVendorId);
      expect(Number(b.paid_cents)).toBe(Number(b.amount_cents)); // fully closed (cash + non-cash deduction)
    }

    // Deduction JE: Dr A/P 275 / Cr driver advance-asset 200 + Cr driver escrow-liability 75.
    const jeId = result.deduction_journal_entry_id!;
    expect(jeId).toBeTruthy();
    const dedLines = await read<{ account_id: string; debit_or_credit: string; amount_cents: string }>(
      `SELECT account_id::text, debit_or_credit, amount_cents::text FROM accounting.journal_entry_postings WHERE journal_entry_uuid=$1::uuid`,
      [jeId]
    );
    const apDebit = dedLines.find((l) => l.account_id === acct.ap && l.debit_or_credit === "debit");
    const advCredit = dedLines.find((l) => l.account_id === acct.advanceSub && l.debit_or_credit === "credit");
    const escCredit = dedLines.find((l) => l.account_id === acct.escrowSub && l.debit_or_credit === "credit");
    expect(Number(apDebit?.amount_cents)).toBe(27500);
    expect(Number(advCredit?.amount_cents)).toBe(20000);
    expect(Number(escCredit?.amount_cents)).toBe(7500);

    // Net cash BillPayments total 1,240 from the DIP bank, GL-credited to the DIP cash account.
    const cashBps = await read<{ c: string; total: string }>(
      `SELECT count(*)::text AS c, COALESCE(SUM(amount_cents),0)::text AS total FROM accounting.bill_payments
        WHERE bill_id = ANY($1::uuid[]) AND settlement_deduction_noncash = false AND from_bank_account_id = $2::uuid`,
      [glBillIds, dipBankId]
    );
    expect(Number(cashBps[0]!.total)).toBe(124000);
    // Scoped to THIS test's own journal entries (not just company+account) — see resolveOwnJournalEntryIds:
    // the shared cash_dip role binding is a global singleton other concurrent real-Postgres suites can
    // repoint mid-race, so an unscoped company+account sum would pick up their postings too.
    const ownJeIds = await resolveOwnJournalEntryIds();
    const dipCredit = await read<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents),0)::text AS total FROM accounting.journal_entry_postings
        WHERE operating_company_id=$1::uuid AND account_id=$2::uuid AND debit_or_credit='credit'
          AND source_transaction_type='bill_payment' AND journal_entry_uuid = ANY($3::uuid[])`,
      [companyId, acct.dipCash, ownJeIds]
    );
    expect(Number(dipCredit[0]!.total)).toBe(124000);

    // Non-cash deduction bill_payment exists (275) and is NOT independently GL-posted.
    const noncash = await read<{ c: string; total: string }>(
      `SELECT count(*)::text AS c, COALESCE(SUM(amount_cents),0)::text AS total FROM accounting.bill_payments
        WHERE bill_id = ANY($1::uuid[]) AND settlement_deduction_noncash = true`,
      [glBillIds]
    );
    expect(Number(noncash[0]!.total)).toBe(27500);
    const noncashPosted = await read<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entry_postings jep
         JOIN accounting.bill_payments bp ON bp.id::text = jep.source_transaction_id AND bp.settlement_deduction_noncash = true
        WHERE jep.operating_company_id=$1::uuid AND jep.source_transaction_type='bill_payment'`,
      [companyId]
    );
    expect(Number(noncashPosted[0]!.c)).toBe(0);

    // GL A/P nets to ZERO: Cr from bills (1515) == Dr from deduction JE (275) + cash payments (1240).
    // Scoped to THIS test's own journal entries (ownJeIds, resolved above) — see resolveOwnJournalEntryIds:
    // the shared ap_control role is a single mutable slot other concurrent real-Postgres suites can point
    // at THIS account mid-race, so an unscoped company+account sum picks up their postings too.
    const apNet = await read<{ dr: string; cr: string }>(
      `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='debit'),0)::text AS dr,
              COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='credit'),0)::text AS cr
         FROM accounting.journal_entry_postings
        WHERE operating_company_id=$1::uuid AND account_id=$2::uuid AND journal_entry_uuid = ANY($3::uuid[])`,
      [companyId, acct.ap, ownJeIds]
    );
    expect(Number(apNet[0]!.cr)).toBe(151500);
    expect(Number(apNet[0]!.dr)).toBe(151500); // nets to 0

    // Connectivity: one gl_run + 3 gl_bills linking settlement -> driver_bill -> load -> accounting.bill.
    const conn = await read<{ runs: string; billrows: string }>(
      `SELECT (SELECT count(*) FROM driver_finance.driver_settlement_gl_runs WHERE settlement_id=$1::uuid)::text AS runs,
              (SELECT count(*) FROM driver_finance.driver_settlement_gl_bills WHERE settlement_id=$1::uuid)::text AS billrows`,
      [settlementId]
    );
    expect(Number(conn[0]!.runs)).toBe(1);
    expect(Number(conn[0]!.billrows)).toBe(3);
  });

  it("(c) idempotent -> second post is already_posted, no duplicate bills", async () => {
    // Re-assert OUR OWN flag override rather than trusting it survived since test (b): the flag row is
    // keyed (flag_key, operating_company_id) on this SAME shared TRANSP company, and a concurrent sibling
    // real-Postgres suite on the same flag_key (settlement-gl-posting.db.test.ts also drives
    // SETTLEMENT_GL_POSTING_ENABLED for this company) can DELETE+re-INSERT that row between tests under
    // vitest's parallel db-test execution — flipping us back to flag-off and masking the real
    // already_posted check (postSettlementBillPayment gates on the flag BEFORE checking run status).
    // idempotent no-op when nobody raced us; see resolveOwnJournalEntryIds above for the sibling
    // contamination pattern (shared-company-db-test-contamination).
    await setFlag(true);
    const result = (await postSettlementBillPayment({ operatingCompanyId: companyId, settlementId }, { userId })) as SettlementBillPaymentResult;
    expect(result.result).toBe("already_posted");
    const glBillIds = await resolveGlBillIds();
    const billCount = await read<{ c: string }>(`SELECT count(*)::text AS c FROM accounting.bills WHERE id = ANY($1::uuid[])`, [glBillIds]);
    expect(Number(billCount[0]!.c)).toBe(3);
  });

  it("(d) CPA veto: concurrent/retried reversal is atomic, idempotent, linked, and whole-settlement net-zero", async () => {
    const originalJeIds = await resolveOwnJournalEntryIds();
    expect(originalJeIds).toHaveLength(7); // 3 bills + 3 cash payments + 1 deduction JE

    // Two concurrent attempts serialize on driver_settlement_gl_runs FOR UPDATE. Exactly one performs
    // the reversal; the other observes status='reversed'. No duplicate source or deduction reversal JEs.
    const [revA, revB] = await Promise.all([
      reverseSettlementBillPayment(
        { operatingCompanyId: companyId, settlementId, reason: "test concurrent reversal A" },
        { userId }
      ),
      reverseSettlementBillPayment(
        { operatingCompanyId: companyId, settlementId, reason: "test concurrent reversal B" },
        { userId }
      ),
    ]);
    expect([revA.result, revB.result].sort()).toEqual(["nothing_to_reverse", "reversed"]);

    const run = await read<{ status: string }>(
      `SELECT status FROM driver_finance.driver_settlement_gl_runs WHERE settlement_id=$1::uuid LIMIT 1`,
      [settlementId]
    );
    expect(run[0]!.status).toBe("reversed");

    const reversalJeIds = await resolveReversalJournalEntryIds(originalJeIds);
    expect(reversalJeIds).toHaveLength(7);
    expect(new Set(reversalJeIds).size).toBe(7);

    // All seven legs use the coherent canonical policy. This fixture's original period is open, so
    // every reversal stays on the original date (closed-period behavior is covered deterministically
    // in posting-engine.service.test.ts and void.service tests).
    const dates = await read<{ original_date: string; reversal_date: string }>(
      `SELECT orig.entry_date::text AS original_date, rev.entry_date::text AS reversal_date
         FROM accounting.journal_entries orig
         JOIN accounting.journal_entry_postings op ON op.journal_entry_uuid=orig.id
         JOIN accounting.journal_entry_postings rp ON rp.reversal_of_line_id=op.id
         JOIN accounting.journal_entries rev ON rev.id=rp.journal_entry_uuid
        WHERE orig.id = ANY($1::uuid[])
        GROUP BY orig.id, orig.entry_date, rev.id, rev.entry_date`,
      [originalJeIds]
    );
    expect(dates.every((row) => row.reversal_date === row.original_date)).toBe(true);

    // Whole-settlement equal-and-opposite at account+class+entity grain — not merely standalone JE balance.
    const allJeIds = [...originalJeIds, ...reversalJeIds];
    const residual = await read<{ nonzero_dimensions: string; absolute_residual_cents: string }>(
      `WITH dimensional AS (
         SELECT account_id, class_id, entity_uuid,
                SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END)::bigint AS residual_cents
           FROM accounting.journal_entry_postings
          WHERE operating_company_id=$1::uuid AND journal_entry_uuid = ANY($2::uuid[])
          GROUP BY account_id, class_id, entity_uuid
       )
       SELECT COUNT(*) FILTER (WHERE residual_cents<>0)::text AS nonzero_dimensions,
              COALESCE(SUM(ABS(residual_cents)),0)::text AS absolute_residual_cents
         FROM dimensional`,
      [companyId, allJeIds]
    );
    expect(Number(residual[0]!.nonzero_dimensions)).toBe(0);
    expect(Number(residual[0]!.absolute_residual_cents)).toBe(0);

    // A later retry is a no-op and cannot add another JE.
    const retry = await reverseSettlementBillPayment(
      { operatingCompanyId: companyId, settlementId, reason: "retry after commit" },
      { userId }
    );
    expect(retry.result).toBe("nothing_to_reverse");
    expect(await resolveReversalJournalEntryIds(originalJeIds)).toHaveLength(7);
  });
});
