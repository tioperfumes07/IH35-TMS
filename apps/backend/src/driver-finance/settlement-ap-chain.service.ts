/**
 * ROUND 326 queue items 2–5 (CC-1) — THE SINGLE SETTLEMENT POSTER. Owner rulings 2026-10-02:
 *   • driver pay is A/P PER LOAD — one accounting bill per load, numbered EXACTLY as the load, driver as vendor;
 *   • a cash advance is a BILL PAYMENT applied against that load's own bill;
 *   • reimbursement and extra pay always belong to a load — by the transaction's date when no load is named;
 *   • NO holding / clearing accounts — net pay is a bill payment from a real bank (default the operating bank).
 *
 * Called by closeSettlementPayRun (the Close button) on ITS transaction, after it has computed and validated the
 * pay-run (5% floor, loan decision, signed-document net, escrow cap). This module only writes the documents:
 *   1. per load: createBillInClientTx  (Dr driver pay / reimbursement / detention per line · Cr A/P), GL posted
 *      in the same transaction (postSourceTransactionInClientTx 'bill');
 *   2. non-cash applications against those bills — advances first (each to its own load's bill), then deductions
 *      and chargebacks, then escrow (pay-first-then-escrow): payBillInClientTx(settlementDeductionNoncash) + ONE
 *      application JE (Dr A/P · Cr each target account);
 *   3. net pay: payBillInClientTx from the bank (Dr A/P · Cr bank), per bill, for what each bill still owes;
 *   4. the spine: driver_settlement_gl_runs + driver_settlement_gl_bills (settlement → load → bill → JEs →
 *      payments), driver_bills settled/paid, each advance stamped linked_bill_id / linked_bill_payment_id.
 * Nothing is plugged: every total must tie to the pay-run's computed figure or the close refuses by name.
 */
import type pg from "pg";
import { createBillInClientTx, payBillInClientTx } from "../accounting/bills.service.js";
import { postSourceTransactionInClientTx } from "../accounting/posting-engine.service.js";
import { createJournalEntryOnClient } from "../accounting/journal-entries.service.js";
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";
import { resolveDriverVendorLink, DriverVendorMissingError } from "../accounting/driver-vendor-link.service.js";

export class SettlementApChainError extends Error {
  constructor(public code: string, message: string, public details: Record<string, unknown> = {}) {
    super(message);
  }
}

export type ApChainLoadBill = { driverBillId: string; loadId: string; loadNumber: string; grossCents: number; spanStart: string | null; spanEnd: string | null };
export type ApChainPayItem = { kind: "pay" | "reimbursement" | "detention_pay"; cents: number; accountId: string; loadId: string | null; date: string | null; description: string };
export type ApChainApplication = { kind: "advance" | "deduction" | "chargeback" | "escrow"; cents: number; accountId: string; description: string; advanceId?: string; preferredLoadId?: string | null };

/** Pure: the load a dated item belongs to — the load whose dates cover the date, else the nearest load by date. */
export function attributeToLoad(bills: ApChainLoadBill[], date: string | null): ApChainLoadBill | null {
  if (!bills.length) return null;
  if (!date) return bills[0];
  const d = date.slice(0, 10);
  const covering = bills.find((b) => b.spanStart && b.spanEnd && b.spanStart.slice(0, 10) <= d && d <= b.spanEnd.slice(0, 10));
  if (covering) return covering;
  const dist = (b: ApChainLoadBill) => {
    const s = (b.spanStart ?? b.spanEnd ?? "").slice(0, 10);
    const e = (b.spanEnd ?? b.spanStart ?? "").slice(0, 10);
    if (!s) return Number.MAX_SAFE_INTEGER;
    const t = Date.parse(d);
    return Math.min(Math.abs(t - Date.parse(s)), Math.abs(t - Date.parse(e)));
  };
  return [...bills].sort((a, b) => dist(a) - dist(b))[0];
}

/** Pure: allocate an application across bills' remaining balances — preferred bill first, then oldest-first. */
export function allocateApplication(remaining: Map<string, number>, order: string[], cents: number, preferredBillKey?: string | null): Array<{ key: string; cents: number }> {
  const out: Array<{ key: string; cents: number }> = [];
  let left = cents;
  const seq = preferredBillKey && remaining.has(preferredBillKey) ? [preferredBillKey, ...order.filter((k) => k !== preferredBillKey)] : order;
  for (const k of seq) {
    if (left <= 0) break;
    const avail = remaining.get(k) ?? 0;
    if (avail <= 0) continue;
    const take = Math.min(avail, left);
    remaining.set(k, avail - take);
    out.push({ key: k, cents: take });
    left -= take;
  }
  if (left > 0) throw new SettlementApChainError("APPLICATIONS_EXCEED_BILLS", `Applications exceed what the load bills owe by ${left}c`, { unapplied_cents: left });
  return out;
}

/** The settlement's per-load driver bills with each load's date span (stops). */
export async function loadSettlementLoadBills(client: pg.PoolClient, opco: string, settlementId: string, driverId: string): Promise<ApChainLoadBill[]> {
  const r = await client.query<{ id: string; load_id: string; load_number: string | null; gross: string; span_start: string | null; span_end: string | null }>(
    `SELECT db.id::text, db.load_id::text, COALESCE(l.load_number, db.load_number) AS load_number, db.gross_amount_cents::text AS gross,
            (SELECT min(COALESCE(st.actual_arrival_at, st.appointment_start_at, st.scheduled_arrival_at))::text FROM mdata.load_stops st WHERE st.load_id = db.load_id) AS span_start,
            (SELECT max(COALESCE(st.actual_departure_at, st.actual_arrival_at, st.appointment_end_at, st.scheduled_departure_at, st.scheduled_arrival_at))::text FROM mdata.load_stops st WHERE st.load_id = db.load_id) AS span_end
       FROM driver_finance.driver_bills db
       JOIN mdata.loads l ON l.id = db.load_id AND l.operating_company_id = db.operating_company_id
      WHERE db.operating_company_id = $1::uuid AND db.voided_at IS NULL AND db.status <> 'void'
        AND (db.driver_id = $3::uuid OR db.team_driver_id = $3::uuid)
        AND (db.settled_in_settlement_id = $2::uuid OR l.presettlement_link_id = $2::uuid)
      ORDER BY span_start NULLS LAST, l.load_number`,
    [opco, settlementId, driverId]
  );
  return r.rows.map((x) => ({ driverBillId: x.id, loadId: x.load_id, loadNumber: String(x.load_number ?? x.load_id), grossCents: Number(x.gross), spanStart: x.span_start, spanEnd: x.span_end }));
}

/** The bank a payment posts from: the payment method's bank, else the entity's operating bank (owner: BofA). Never a holding account. */
export async function resolvePayoutBankAccountId(client: pg.PoolClient, opco: string, paymentMethodGlAccountId: string | null): Promise<string> {
  if (paymentMethodGlAccountId) {
    const m = await client.query<{ id: string }>(
      `SELECT id::text FROM banking.bank_accounts WHERE operating_company_id = $1::uuid AND ledger_account_id = $2::uuid AND is_active AND deactivated_at IS NULL ORDER BY created_at LIMIT 1`,
      [opco, paymentMethodGlAccountId]
    );
    if (m.rows[0]) return m.rows[0].id;
  }
  const bankGl = await resolveRoleAccountOptional(client as never, opco, "operating_bank");
  if (bankGl) {
    const b = await client.query<{ id: string }>(
      `SELECT id::text FROM banking.bank_accounts WHERE operating_company_id = $1::uuid AND ledger_account_id = $2::uuid AND is_active AND deactivated_at IS NULL ORDER BY created_at LIMIT 1`,
      [opco, bankGl]
    );
    if (b.rows[0]) return b.rows[0].id;
  }
  throw new SettlementApChainError("PAYOUT_BANK_MISSING", "No bank account for the payout: the payment method is not a bank account and no operating_bank role is bound to an active bank account");
}

export type ApChainInput = {
  operatingCompanyId: string;
  settlementId: string;
  driverId: string;
  label: string;
  billDate: string;
  actorUserId: string;
  driverPayAccountId: string;
  grossCents: number;
  payItems: ApChainPayItem[];
  applications: ApChainApplication[];
  netCents: number;
  payoutBankAccountId: string | null;
  paymentReference?: string | null;
};

export type ApChainResult = {
  run_id: string;
  application_journal_entry_id: string | null;
  bills: Array<{ load_number: string; accounting_bill_id: string; bill_journal_entry_id: string | null; cash_bill_payment_id: string | null; cash_journal_entry_id: string | null; total_cents: number; applied_cents: number; cash_cents: number }>;
};

export async function postSettlementApChainInClientTx(client: pg.PoolClient, input: ApChainInput): Promise<ApChainResult> {
  const opco = input.operatingCompanyId;
  let vendorId: string;
  try {
    vendorId = (await resolveDriverVendorLink(client as never, opco, input.driverId)).vendorId;
  } catch (e) {
    if (e instanceof DriverVendorMissingError) throw new SettlementApChainError("DRIVER_VENDOR_MISSING", e.message);
    throw e;
  }
  const apAccount = await resolveRoleAccountOptional(client as never, opco, "ap_control");
  if (!apAccount) throw new SettlementApChainError("AP_ACCOUNT_MISSING", "No A/P control account (ap_control) designated");

  const bills = await loadSettlementLoadBills(client, opco, input.settlementId, input.driverId);
  if (!bills.length) throw new SettlementApChainError("NO_LOAD_BILLS", `${input.label} has no per-load driver bills — a settlement pays loads`);

  // Lines per load, from the settlement's own pay lines (the same rows the header gross sums — earnings, extra pay,
  // deadhead, team splits — so a team load bills each driver's share, never the whole load twice), plus
  // reimbursements and detention. A line names its load; one that does not goes to the load whose dates cover it.
  const lines = new Map<string, Array<{ accountId: string; amountCents: number; description: string }>>();
  for (const b of bills) lines.set(b.driverBillId, []);
  let payCents = 0;
  for (const item of input.payItems) {
    if (item.cents <= 0) continue;
    if (item.loadId && !bills.find((b) => b.loadId === item.loadId)) {
      throw new SettlementApChainError("PAY_ITEM_LOAD_NOT_ON_SETTLEMENT", `${item.description} names a load that is not on ${input.label}`, { load_id: item.loadId });
    }
    const target = (item.loadId && bills.find((b) => b.loadId === item.loadId)) || attributeToLoad(bills, item.date);
    if (!target) throw new SettlementApChainError("PAY_ITEM_HAS_NO_LOAD", `${item.description} could not be tied to a load of ${input.label}`);
    lines.get(target.driverBillId)!.push({ accountId: item.accountId, amountCents: item.cents, description: `Load ${target.loadNumber} — ${item.description}` });
    if (item.kind === "pay") payCents += item.cents;
  }
  const billsGross = payCents;
  if (billsGross !== input.grossCents) {
    throw new SettlementApChainError("GROSS_DOES_NOT_TIE_TO_LOAD_BILLS", `${input.label}: the load bills carry ${billsGross}c of driver pay but the pay-run gross is ${input.grossCents}c`, { load_bills_cents: billsGross, payrun_gross_cents: input.grossCents });
  }

  // Run anchor (spine). One run per settlement; a second close is refused upstream by the pay-run claim.
  const run = await client.query<{ id: string }>(
    `INSERT INTO driver_finance.driver_settlement_gl_runs
       (operating_company_id, settlement_id, driver_id, driver_vendor_id, run_key, gross_cents, deductions_cents, net_cents, status, posted_by_user_id)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, 'posted', $9::uuid)
     ON CONFLICT (operating_company_id, settlement_id) DO NOTHING
     RETURNING id::text`,
    [opco, input.settlementId, input.driverId, vendorId, `settlement-ap-chain:${opco}:${input.settlementId}`, input.grossCents,
      input.applications.reduce((s, a) => s + a.cents, 0), input.netCents, input.actorUserId]
  );
  if (!run.rows[0]) throw new SettlementApChainError("SETTLEMENT_ALREADY_POSTED", `${input.label} already has a settlement GL run — it is never posted twice`);
  const runId = run.rows[0].id;

  // 1. One A/P bill per load, GL posted in this transaction.
  const posted: Array<{ b: ApChainLoadBill; billId: string; billJeId: string | null; total: number }> = [];
  for (const b of bills) {
    const ls = lines.get(b.driverBillId)!;
    const total = ls.reduce((s, l) => s + l.amountCents, 0);
    if (total <= 0) continue;
    const dup = await client.query(
      `SELECT 1 FROM accounting.bills WHERE operating_company_id = $1::uuid AND mdata_vendor_id = $2::uuid AND bill_number = $3 AND voided_at IS NULL LIMIT 1`,
      [opco, vendorId, b.loadNumber]
    );
    if (dup.rows.length) throw new SettlementApChainError("LOAD_BILL_ALREADY_EXISTS", `An A/P bill numbered ${b.loadNumber} already exists for this driver — a load is billed once`, { load_number: b.loadNumber });
    const bill = await createBillInClientTx(client, {
      operatingCompanyId: opco,
      vendorId,
      driverId: input.driverId,
      billNumber: b.loadNumber,
      billDate: input.billDate,
      amountCents: total,
      memo: `${input.label} — driver pay, load ${b.loadNumber}`,
      coaAccountId: input.driverPayAccountId,
      lines: ls.map((l) => ({ accountId: l.accountId, amountCents: l.amountCents, description: l.description, loadId: b.loadId })),
    } as never, input.actorUserId);
    const billId = String((bill as { id: string }).id);
    const p = await postSourceTransactionInClientTx(client as never, { operating_company_id: opco, source_transaction_type: "bill", source_transaction_id: billId, posting_purpose: "initial_post" } as never, { userId: input.actorUserId } as never);
    posted.push({ b, billId, billJeId: (p as { journal_entry_id?: string | null })?.journal_entry_id ?? null, total });
  }

  // 2. Non-cash applications: advances (own load first), deductions + chargebacks, escrow last.
  const remaining = new Map(posted.map((x) => [x.billId, x.total]));
  const order = posted.map((x) => x.billId);
  const applied = new Map<string, number>();
  const appPostings: Array<{ account_id: string; debit_or_credit: "debit" | "credit"; amount_cents: number; description: string }> = [];
  const firstNoncashBp = new Map<string, string>();
  const rank = { advance: 0, deduction: 1, chargeback: 1, escrow: 2 } as const;
  for (const app of [...input.applications].sort((a, z) => rank[a.kind] - rank[z.kind])) {
    if (app.cents <= 0) continue;
    const preferred = app.preferredLoadId ? posted.find((x) => x.b.loadId === app.preferredLoadId)?.billId ?? null : null;
    const parts = allocateApplication(remaining, order, app.cents, preferred);
    for (const part of parts) {
      const bp = await payBillInClientTx(client, {
        operatingCompanyId: opco, billId: part.key, paymentDate: input.billDate, amountCents: part.cents, paymentMethod: "other",
        memo: `${input.label} — ${app.description}`, settlementDeductionNoncash: true,
      } as never, input.actorUserId);
      const bpId = String((bp as { id: string }).id);
      if (!firstNoncashBp.has(part.key)) firstNoncashBp.set(part.key, bpId);
      applied.set(part.key, (applied.get(part.key) ?? 0) + part.cents);
      appPostings.push({ account_id: apAccount, debit_or_credit: "debit", amount_cents: part.cents, description: `${input.label} — ${app.description}` });
      if (app.kind === "advance" && app.advanceId) {
        await client.query(
          `UPDATE driver_finance.driver_advances SET linked_bill_id = COALESCE(linked_bill_id, $2::uuid), linked_bill_payment_id = COALESCE(linked_bill_payment_id, $3::uuid), updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $4::uuid`,
          [app.advanceId, part.key, bpId, opco]
        );
      }
    }
    appPostings.push({ account_id: app.accountId, debit_or_credit: "credit", amount_cents: app.cents, description: `${input.label} — ${app.description}` });
  }
  let applicationJeId: string | null = null;
  if (appPostings.length >= 2) {
    const je = await createJournalEntryOnClient(client as never, {
      operating_company_id: opco,
      entry_date: input.billDate,
      memo: `${input.label} — advances, deductions and escrow applied to the load bills`,
      source: "auto",
      source_transaction_type: "driver_settlement",
      source_transaction_id: input.settlementId,
      postings: appPostings,
    }, { userId: input.actorUserId, role: "system" });
    applicationJeId = je.id;
    await client.query(`UPDATE driver_finance.driver_settlement_gl_runs SET deduction_journal_entry_id = $2::uuid WHERE id = $1::uuid`, [runId, applicationJeId]);
  }

  // 3. Net pay: each bill's remaining balance, from the bank (Dr A/P · Cr bank, posted by payBill in this transaction).
  const netTotal = [...remaining.values()].reduce((s, v) => s + v, 0);
  if (netTotal !== input.netCents) {
    throw new SettlementApChainError("NET_DOES_NOT_TIE", `${input.label}: the load bills leave ${netTotal}c to pay but the pay-run net is ${input.netCents}c`, { bills_net_cents: netTotal, payrun_net_cents: input.netCents });
  }
  if (netTotal > 0 && !input.payoutBankAccountId) throw new SettlementApChainError("PAYOUT_BANK_MISSING", `${input.label} pays ${netTotal}c and has no bank account to pay from`);
  const out: ApChainResult["bills"] = [];
  for (const x of posted) {
    const cash = remaining.get(x.billId) ?? 0;
    let cashBpId: string | null = null;
    let cashJeId: string | null = null;
    if (cash > 0) {
      const bp = await payBillInClientTx(client, {
        operatingCompanyId: opco, billId: x.billId, paymentDate: input.billDate, amountCents: cash, paymentMethod: "ach",
        fromBankAccountId: input.payoutBankAccountId!, referenceNumber: input.paymentReference ?? undefined,
        memo: `${input.label} — net driver pay, load ${x.b.loadNumber}`,
      } as never, input.actorUserId);
      cashBpId = String((bp as { id: string }).id);
      cashJeId = (await client.query<{ je: string | null }>(
        `SELECT DISTINCT p.journal_entry_uuid::text AS je FROM accounting.journal_entry_postings p
          WHERE p.operating_company_id = $1::uuid AND p.source_transaction_type = 'bill_payment' AND p.source_transaction_id::text = $2 LIMIT 1`,
        [opco, cashBpId]
      )).rows[0]?.je ?? null;
    }
    await client.query(
      `UPDATE driver_finance.driver_bills SET settled_in_settlement_id = $2::uuid, status = 'paid', updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $3::uuid AND status <> 'void'`,
      [x.b.driverBillId, input.settlementId, opco]
    );
    await client.query(
      `INSERT INTO driver_finance.driver_settlement_gl_bills
         (operating_company_id, run_id, settlement_id, driver_bill_id, load_id, load_number, accounting_bill_id, bill_journal_entry_id,
          cash_bill_payment_id, cash_journal_entry_id, deduction_bill_payment_id, gross_cents, deduction_cents, cash_cents)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7::uuid,$8::uuid,$9::uuid,$10::uuid,$11::uuid,$12,$13,$14)`,
      [opco, runId, input.settlementId, x.b.driverBillId, x.b.loadId, x.b.loadNumber, x.billId, x.billJeId, cashBpId, cashJeId,
        firstNoncashBp.get(x.billId) ?? null, x.total, applied.get(x.billId) ?? 0, cash]
    );
    out.push({ load_number: x.b.loadNumber, accounting_bill_id: x.billId, bill_journal_entry_id: x.billJeId, cash_bill_payment_id: cashBpId, cash_journal_entry_id: cashJeId, total_cents: x.total, applied_cents: applied.get(x.billId) ?? 0, cash_cents: cash });
  }
  return { run_id: runId, application_journal_entry_id: applicationJeId, bills: out };
}
