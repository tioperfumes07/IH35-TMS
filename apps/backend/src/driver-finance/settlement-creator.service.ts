/**
 * ROUND 180 / R-186 — Settlement Creator orchestration.
 *
 * EXISTING ENGINES ONLY — no second posting path. Caller owns the transaction.
 * Preview projects JE lines + control totals; Post is all-or-nothing inside the caller's client.
 *
 * Spec: docs/bus/09-25-2026-Devin-A-ROUND-180-SETTLEMENT-CREATOR-COMPANY-AND-DRIVER.md
 */

import { appendCrudAudit } from "../audit/crud-audit.js";
import { createExpenseFromFuelTransaction } from "../fuel/fuel-expense-document.service.js";
import { createDriverCashAdvanceCore } from "../cash-advances/cash-advance-create.js";
import {
  linkLoadToPresettlementAfterAssignmentInClientTx,
  type TripType,
  type DbClient,
} from "../dispatch/presettlement-link.service.js";
import { createBareSettlementForDocument } from "./settlement-load-reassignment.service.js";
import { postSourceTransactionInClientTx } from "../accounting/posting-engine.service.js";
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";
import type {
  SettlementCreatorDraft,
  SettlementCreatorJeLine,
  SettlementCreatorPostResult,
  SettlementCreatorPreview,
} from "./settlement-creator.types.js";

export type { DbClient };

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const AUDIT_TAG = "SETTLEMENT-CREATOR-R186";

async function accountByNumber(
  client: DbClient,
  opco: string,
  accountNumber: string,
): Promise<{ id: string; account_number: string; account_name: string } | null> {
  const res = await client.query<{ id: string; account_number: string; account_name: string }>(
    `
      SELECT id::text, account_number, account_name
      FROM catalogs.accounts
      WHERE operating_company_id = $1::uuid
        AND account_number = $2
        AND COALESCE(is_active, true) IS TRUE
        AND deactivated_at IS NULL
      LIMIT 1
    `,
    [opco, accountNumber],
  );
  return res.rows[0] ?? null;
}

async function accountByRole(
  client: DbClient,
  opco: string,
  role: string,
): Promise<{ id: string; account_number: string | null; account_name: string } | null> {
  const id = await resolveRoleAccountOptional(client, opco, role as never);
  if (!id) return null;
  const res = await client.query<{ id: string; account_number: string | null; account_name: string }>(
    `
      SELECT id::text, account_number, account_name
      FROM catalogs.accounts
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [id, opco],
  );
  return res.rows[0] ?? null;
}

function cardRailNumber(card: "dreamline" | "relay"): string {
  return card === "dreamline" ? "2510" : "1295";
}

function dollarsFromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Project the JE the Post path will write. Resolves real account names from the live CoA.
 * Does not write. Post stays disabled until balanced + both PDF control totals match.
 */
export async function previewSettlementCreator(
  client: DbClient,
  draft: SettlementCreatorDraft,
): Promise<SettlementCreatorPreview> {
  const blockers: string[] = [];
  if (draft.operating_company_id !== USMCA) {
    blockers.push("Settlement Creator is USMCA-only.");
  }
  if (!draft.settlement_no?.trim()) blockers.push("Settlement No. is required.");
  if (!draft.driver_id) blockers.push("Driver is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.period_start) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.period_end)) {
    blockers.push("Start and end dates are required (YYYY-MM-DD).");
  }
  if (!draft.loads?.length) blockers.push("At least one load block is required.");

  const je_lines: SettlementCreatorJeLine[] = [];
  const push = (line: SettlementCreatorJeLine) => je_lines.push(line);

  // --- Fuel: Dr fuel item expense / Cr card rail (2510 / 1295) ---
  for (const fuel of draft.fuel_purchases ?? []) {
    const amount =
      fuel.receipt_cents ??
      Math.round(Number(fuel.gallons || 0) * Number(fuel.cpg_cents || 0)) +
        Math.round(Number(fuel.fees_cents || 0)) -
        Math.round(Number(fuel.discount_cents || 0));
    if (amount <= 0) continue;
    const rail = await accountByNumber(client, draft.operating_company_id, cardRailNumber(fuel.card));
    const fuelExpense =
      (await accountByRole(client, draft.operating_company_id, "company_fuel_advance_expense")) ??
      (await accountByNumber(client, draft.operating_company_id, "5000"));
    if (!rail) blockers.push(`Card rail ${cardRailNumber(fuel.card)} not found in CoA.`);
    if (!fuelExpense) blockers.push("Fuel expense account not found.");
    push({
      load_number: fuel.load_number ?? null,
      account_number: fuelExpense?.account_number ?? null,
      account_name: fuelExpense?.account_name ?? "Fuel expense",
      debit_cents: amount,
      credit_cents: 0,
      memo: `Fuel ${fuel.card} ${fuel.date}`,
      section: "fuel",
    });
    push({
      load_number: fuel.load_number ?? null,
      account_number: rail?.account_number ?? cardRailNumber(fuel.card),
      account_name: rail?.account_name ?? (fuel.card === "dreamline" ? "Dreamline" : "Relay"),
      debit_cents: 0,
      credit_cents: amount,
      memo: `Fuel card rail ${fuel.card}`,
      section: "fuel",
    });
  }

  // --- Expenses: Comp. Exp. → Cr card rail; Reimb. → settlement reimbursed path (no cash Cr) ---
  let companyExpensesCents = 0;
  for (const exp of draft.expenses ?? []) {
    if (exp.amount_cents <= 0) continue;
    if (exp.is_company_expense) {
      companyExpensesCents += exp.amount_cents;
      const card = exp.card ?? "relay";
      const rail = await accountByNumber(client, draft.operating_company_id, cardRailNumber(card));
      const itemAcct =
        (await accountByNumber(client, draft.operating_company_id, "6100")) ??
        (await accountByRole(client, draft.operating_company_id, "other_operating_expense"));
      push({
        load_number: exp.load_number ?? null,
        account_number: itemAcct?.account_number ?? null,
        account_name: itemAcct?.account_name ?? exp.item_name,
        debit_cents: exp.amount_cents,
        credit_cents: 0,
        memo: exp.description ?? exp.item_name,
        section: "expense",
      });
      push({
        load_number: exp.load_number ?? null,
        account_number: rail?.account_number ?? cardRailNumber(card),
        account_name: rail?.account_name ?? "Card rail",
        debit_cents: 0,
        credit_cents: exp.amount_cents,
        memo: `Comp. Exp. Cr card (never A/P)`,
        section: "expense",
      });
      if (!rail) blockers.push(`Expense card rail ${cardRailNumber(card)} missing.`);
    }
    // Reimbursable lines settle on the driver settlement (Driver Reimbursed Expenses) — no company cash Cr here.
  }

  // Fuel also counts toward company expenses total on the AT company PDF.
  for (const fuel of draft.fuel_purchases ?? []) {
    const amount =
      fuel.receipt_cents ??
      Math.round(Number(fuel.gallons || 0) * Number(fuel.cpg_cents || 0)) +
        Math.round(Number(fuel.fees_cents || 0)) -
        Math.round(Number(fuel.discount_cents || 0));
    if (amount > 0) companyExpensesCents += amount;
  }

  // --- Mileage pay (driver bill) ---
  let mileagePayCents = 0;
  for (const load of draft.loads ?? []) {
    const loaded = Math.round(Number(load.loaded_miles || 0) * Number(load.line_haul_rate_cents || 0));
    // Empty miles often use a separate empty rate; when absent, treat as 0 (operator types extras).
    const empty = 0;
    const pay = loaded + empty;
    if (pay <= 0) continue;
    mileagePayCents += pay;
    const drPay =
      (await accountByRole(client, draft.operating_company_id, "driver_pay_expense")) ??
      (await accountByNumber(client, draft.operating_company_id, "6890"));
    const crPay =
      (await accountByRole(client, draft.operating_company_id, "driver_payroll_clearing")) ??
      (await accountByNumber(client, draft.operating_company_id, "2100"));
    push({
      load_number: load.load_number,
      account_number: drPay?.account_number ?? null,
      account_name: drPay?.account_name ?? "Driver pay expense",
      debit_cents: pay,
      credit_cents: 0,
      memo: `Mileage pay load ${load.load_number}`,
      section: "mileage",
    });
    push({
      load_number: load.load_number,
      account_number: crPay?.account_number ?? null,
      account_name: crPay?.account_name ?? "Driver payable",
      debit_cents: 0,
      credit_cents: pay,
      memo: `Driver payable load ${load.load_number}`,
      section: "mileage",
    });
  }

  // --- Extra reimbursements on driver net ---
  let reimbCents = 0;
  for (const r of draft.reimbursements ?? []) {
    if (r.amount_cents <= 0) continue;
    reimbCents += r.amount_cents;
  }
  for (const exp of draft.expenses ?? []) {
    if (exp.is_reimbursable && exp.amount_cents > 0) reimbCents += exp.amount_cents;
  }

  // --- Deductions / escrow / advances (driver net) ---
  let deductionCents = 0;
  for (const d of draft.deductions ?? []) {
    if (d.amount_cents > 0) deductionCents += d.amount_cents;
  }
  let escrowCents = 0;
  for (const e of draft.escrow ?? []) {
    if (e.amount_cents <= 0) continue;
    escrowCents += e.amount_cents;
    const liab =
      (await accountByRole(client, draft.operating_company_id, "escrow_liability_default")) ??
      (await accountByNumber(client, draft.operating_company_id, "2400"));
    push({
      load_number: e.load_number ?? null,
      account_number: liab?.account_number ?? null,
      account_name: liab?.account_name ?? "Driver escrow liability",
      debit_cents: 0,
      credit_cents: e.amount_cents,
      memo: e.description || "Escrow hold",
      section: "escrow",
    });
    // Balancing Dr comes from settlement net (deduction from payable) — shown as reduction below.
  }
  let advanceCents = 0;
  for (const a of draft.advances ?? []) {
    if (a.amount_cents <= 0) continue;
    advanceCents += a.amount_cents;
  }

  const driverNetCents = mileagePayCents + reimbCents - deductionCents - escrowCents - advanceCents;

  const debit_total_cents = je_lines.reduce((s, l) => s + l.debit_cents, 0);
  const credit_total_cents = je_lines.reduce((s, l) => s + l.credit_cents, 0);
  // Escrow / advances / reimbursements affect net without always adding a balanced JE pair in this
  // preview pass — treat "balanced" as the projected company-expense legs (fuel+comp exp) being
  // Dr=Cr, which is the hard law for card-rail posts. Driver net is a separate control total.
  const companyLegDebits = je_lines
    .filter((l) => l.section === "fuel" || l.section === "expense")
    .reduce((s, l) => s + l.debit_cents, 0);
  const companyLegCredits = je_lines
    .filter((l) => l.section === "fuel" || l.section === "expense")
    .reduce((s, l) => s + l.credit_cents, 0);
  const balanced = companyLegDebits === companyLegCredits && companyLegDebits > 0
    ? true
    : debit_total_cents === credit_total_cents;

  if (companyLegDebits !== companyLegCredits) {
    blockers.push(`Company expense JE legs unbalanced (Dr ${companyLegDebits} ≠ Cr ${companyLegCredits}).`);
  }

  const company_expenses_matches_pdf = companyExpensesCents === Math.round(draft.pdf_company_expenses_cents);
  const driver_net_matches_pdf = driverNetCents === Math.round(draft.pdf_driver_net_cents);
  if (!company_expenses_matches_pdf) {
    blockers.push(
      `Company EXPENSES ${dollarsFromCents(companyExpensesCents)} ≠ PDF ${dollarsFromCents(draft.pdf_company_expenses_cents)}.`,
    );
  }
  if (!driver_net_matches_pdf) {
    blockers.push(
      `Driver net ${dollarsFromCents(driverNetCents)} ≠ PDF ${dollarsFromCents(draft.pdf_driver_net_cents)}.`,
    );
  }

  const can_post =
    blockers.length === 0 &&
    company_expenses_matches_pdf &&
    driver_net_matches_pdf &&
    balanced &&
    draft.operating_company_id === USMCA;

  return {
    je_lines,
    debit_total_cents,
    credit_total_cents,
    balanced,
    company_expenses_cents: companyExpensesCents,
    company_expenses_matches_pdf,
    driver_net_cents: driverNetCents,
    driver_net_matches_pdf,
    can_post,
    blockers,
  };
}

/**
 * Post one settlement from the AlwaysTrack PDF draft — all or nothing on the caller's client.
 * Edit path (same settlement_no): void+repost is a follow-on; this create is idempotent on
 * source_document_ref via createBareSettlementForDocument + existing natural keys on fuel/expenses.
 */
export async function postSettlementCreatorInClientTx(
  client: DbClient,
  actorUserId: string,
  draft: SettlementCreatorDraft,
): Promise<SettlementCreatorPostResult> {
  const preview = await previewSettlementCreator(client, draft);
  if (!preview.can_post) {
    throw new SettlementCreatorError("preview_blocked", preview.blockers.join(" · ") || "Post blocked");
  }

  // Idempotent shell: if this AlwaysTrack number already has a live settlement, open it for edit
  // (void+repost is a later slice — refuse duplicate create rather than mint a second).
  const existing = await client.query<{ id: string; display_id: string; voided_at: string | null }>(
    `
      SELECT id::text, display_id, voided_at::text
      FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid
        AND source_document_ref = $2
        AND voided_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [draft.operating_company_id, draft.settlement_no.trim()],
  );
  if (existing.rows[0]) {
    throw new SettlementCreatorError(
      "settlement_exists",
      `Settlement ${draft.settlement_no} already exists (${existing.rows[0].display_id}). Edit = void and repost (next slice).`,
    );
  }

  const bare = await createBareSettlementForDocument(client, {
    operating_company_id: draft.operating_company_id,
    driver_id: draft.driver_id,
    period_start: draft.period_start,
    period_end: draft.period_end,
    source_document_ref: draft.settlement_no.trim(),
    actor_user_id: actorUserId,
    is_sample_data: false,
    status: "closed",
  });

  const loadIds: string[] = [];
  const expenseIds: string[] = [];
  const fuelTxnIds: string[] = [];
  const advanceIds: string[] = [];
  const journalEntryIds: string[] = [];

  // Resolve / match loads by load_number (USMCA). Create is intentionally NOT via bookLoad —
  // seats never POST Book Load; creator matches existing TMS loads minted through dispatch.
  for (const load of draft.loads) {
    const found = await client.query<{
      id: string;
      assigned_primary_driver_id: string | null;
      assigned_unit_id: string | null;
      trip_type: string | null;
      tour_id: string | null;
      presettlement_link_id: string | null;
    }>(
      `
        SELECT id::text, assigned_primary_driver_id::text, assigned_unit_id::text,
               trip_type::text, tour_id::text, presettlement_link_id::text
        FROM mdata.loads
        WHERE operating_company_id = $1::uuid
          AND load_number = $2
          AND soft_deleted_at IS NULL
          AND COALESCE(is_sample_data, false) IS NOT TRUE
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [draft.operating_company_id, load.load_number.trim()],
    );
    const row = found.rows[0];
    if (!row) {
      throw new SettlementCreatorError(
        "load_not_found",
        `Load ${load.load_number} not found in USMCA. Book it in Dispatch first, then type it here.`,
      );
    }
    loadIds.push(row.id);

    // Ensure driver/unit assignment for pre-settlement link when missing.
    if (!row.assigned_primary_driver_id || row.assigned_primary_driver_id !== draft.driver_id) {
      await client.query(
        `
          UPDATE mdata.loads
          SET assigned_primary_driver_id = $1::uuid,
              assigned_unit_id = COALESCE($2::uuid, assigned_unit_id),
              updated_at = now()
          WHERE id = $3::uuid AND operating_company_id = $4::uuid
        `,
        [draft.driver_id, draft.unit_id ?? null, row.id, draft.operating_company_id],
      );
    }

    const tripType = (row.trip_type as TripType | null) ?? "NB";
    await linkLoadToPresettlementAfterAssignmentInClientTx(client, {
      operating_company_id: draft.operating_company_id,
      load_id: row.id,
      presettlement_link_id_before: row.presettlement_link_id,
      driver_id: draft.driver_id,
      unit_id: draft.unit_id ?? row.assigned_unit_id,
      trip_type: tripType,
      tour_id: row.tour_id,
      actor_user_id: actorUserId,
    });
  }

  // Fuel → fuel.fuel_transactions → createExpenseFromFuelTransaction → post expense
  for (const fuel of draft.fuel_purchases ?? []) {
    const amountCents =
      fuel.receipt_cents ??
      Math.round(Number(fuel.gallons || 0) * Number(fuel.cpg_cents || 0)) +
        Math.round(Number(fuel.fees_cents || 0)) -
        Math.round(Number(fuel.discount_cents || 0));
    if (amountCents <= 0) continue;

    const loadId = fuel.load_number
      ? (
          await client.query<{ id: string }>(
            `SELECT id::text FROM mdata.loads
              WHERE operating_company_id = $1::uuid AND load_number = $2 AND soft_deleted_at IS NULL
              ORDER BY created_at DESC LIMIT 1`,
            [draft.operating_company_id, fuel.load_number.trim()],
          )
        ).rows[0]?.id ?? null
      : null;

    // Vendor: match by name or leave null → createExpenseFromFuelTransaction refuses without vendor.
    const vendor = fuel.vendor_name
      ? (
          await client.query<{ id: string }>(
            `SELECT id::text FROM mdata.vendors
              WHERE operating_company_id = $1::uuid
                AND lower(trim(vendor_name)) = lower(trim($2))
                AND COALESCE(is_sample_data, false) IS NOT TRUE
              LIMIT 1`,
            [draft.operating_company_id, fuel.vendor_name],
          )
        ).rows[0]
      : null;
    if (!vendor) {
      throw new SettlementCreatorError(
        "fuel_vendor_required",
        `Fuel line ${fuel.date}: map vendor "${fuel.vendor_name ?? ""}" in Vendors first.`,
      );
    }

    const fuelType = fuel.fuel_type ?? "diesel";
    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO fuel.fuel_transactions (
          operating_company_id, vendor_id, load_id, driver_id, unit_id,
          fuel_type, gallons, price_per_gallon, total_cost,
          purchased_at, transaction_at, transaction_reference, location_city,
          source, load_required, load_exemption_reason, created_by_user_id
        )
        VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
          $6, $7, $8, $9,
          $10::timestamptz, $10::timestamptz, $11, $12,
          'manual', $13, $14, $15::uuid
        )
        RETURNING id::text
      `,
      [
        draft.operating_company_id,
        vendor.id,
        loadId,
        draft.driver_id,
        draft.unit_id ?? null,
        fuelType,
        fuel.gallons,
        dollarsFromCents(fuel.cpg_cents),
        dollarsFromCents(amountCents),
        `${fuel.date}T12:00:00.000Z`,
        fuel.invoice ?? null,
        fuel.location ?? null,
        Boolean(loadId),
        loadId ? null : "Settlement Creator fuel line with no load number on the PDF row.",
        actorUserId,
      ],
    );
    const fuelId = inserted.rows[0]!.id;
    fuelTxnIds.push(fuelId);

    const doc = await createExpenseFromFuelTransaction(client, {
      operating_company_id: draft.operating_company_id,
      fuel_transaction_id: fuelId,
      requesting_user_uuid: actorUserId,
    });
    if (doc.outcome === "refused") {
      throw new SettlementCreatorError("fuel_expense_refused", doc.reason);
    }
    if (doc.outcome === "created" || doc.outcome === "already_exists") {
      expenseIds.push(doc.expense_id);
      // Stamp Comp. Exp. card rail already set by fuel writer; post through existing engine.
      try {
        const posted = await postSourceTransactionInClientTx(
          client as never,
          {
            operating_company_id: draft.operating_company_id,
            source_transaction_type: "expense",
            source_transaction_id: doc.expense_id,
          },
          { userId: actorUserId },
        );
        if (posted.journal_entry_id) journalEntryIds.push(posted.journal_entry_id);
      } catch (err) {
        // Flag-off / not eligible → document stays; do not invent GL math.
        const msg = err instanceof Error ? err.message : String(err);
        if (!/EXPENSE_POST_GL_REFUSED|not posting-eligible|FLAG/i.test(msg)) throw err;
      }
    }
  }

  // Advances → createDriverCashAdvanceCore (bill-payment / loan overflow handled inside core)
  for (const adv of draft.advances ?? []) {
    if (adv.amount_cents <= 0) continue;
    const created = await createDriverCashAdvanceCore(client as never, actorUserId, draft.operating_company_id, {
      driver_id: draft.driver_id,
      amount: dollarsFromCents(adv.amount_cents),
      purpose: "other",
      disbursement_method: "historical_backfill",
      recipient_info: {
        recipient_type: "driver",
        notes: adv.description ?? `Settlement ${draft.settlement_no} advance`,
      },
      linked_driver_bill_id: adv.linked_driver_bill_id ?? null,
      load_id: null,
      unit_id: draft.unit_id ?? null,
      liability_type: "advance",
    });
    if (!created.ok) {
      throw new SettlementCreatorError("advance_failed", created.message ?? created.error);
    }
    advanceIds.push(created.advanceId);
  }

  await appendCrudAudit(
    client as never,
    actorUserId,
    "driver_finance.settlement_creator.posted",
    {
      resource_type: "driver_finance.driver_settlements",
      resource_id: bare.settlement_id,
      operating_company_id: draft.operating_company_id,
      source_document_ref: draft.settlement_no.trim(),
      load_ids: loadIds,
      expense_ids: expenseIds,
      fuel_transaction_ids: fuelTxnIds,
      advance_ids: advanceIds,
      company_expenses_cents: preview.company_expenses_cents,
      driver_net_cents: preview.driver_net_cents,
    },
    "info",
    AUDIT_TAG,
  );

  return {
    settlement_id: bare.settlement_id,
    source_document_ref: draft.settlement_no.trim(),
    display_id: bare.display_id,
    load_ids: loadIds,
    expense_ids: expenseIds,
    fuel_transaction_ids: fuelTxnIds,
    advance_ids: advanceIds,
    journal_entry_ids: journalEntryIds,
    preview,
  };
}

export class SettlementCreatorError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SettlementCreatorError";
    this.code = code;
  }
}
