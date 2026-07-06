// Business-Property Allocation — property-tax ACCRUAL + PAYMENT GL poster. §1.4 financial cluster,
// BUILD-AND-HOLD, INERT until PROPERTY_TAX_GL_POSTING_ENABLED is flipped per entity. Design doc:
// docs/accounting/PROPERTY-TAX-POSTER-DESIGN.md.
//
// Writes ZERO new GL math: every entry is routed through accounting.createJournalEntry (the DB
// double-entry trigger tables — asserts debits===credits>0, writes the transaction_source_links spine +
// audit + QBO-sync), and every account resolves via the entity-pinned role resolver (fail-closed; a
// TRANSP post can never resolve a TRK/USMCA account). Mirrors the factoring/settlement posters exactly:
//   * FLAG GATE first — isEnabled(client, PROPERTY_TAX_GL_POSTING_ENABLED, {operating_company_id}); OFF =>
//     zero writes. Never a global env read; default OFF for every entity until an override row is seeded.
//   * Idempotency: a deterministic memo per (rendition, step); a re-run finds the existing JE and no-ops.
//   * We do NOT edit the shared posting-engine (lane lock) — standalone poster + createJournalEntry.
//
// ACCOUNTING (CPA to confirm — see design doc):
//   ACCRUAL  Dr Property Taxes (property_tax_expense)     / Cr Property Tax Payable (property_tax_payable)
//   PAYMENT  Dr Property Tax Payable (property_tax_payable)/ Cr Cash (cash_clearing)
// A cash-basis entity may skip the accrual and post only the payment (Dr expense / Cr cash) — supported
// via postPropertyTaxPayment's `direct_from_expense` option.

import { withLuciaBypass } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { createJournalEntry } from "../journal-entries.service.js";
import { resolveRoleAccount } from "../coa-roles/resolver.service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";

export const PROPERTY_TAX_GL_POSTING_FLAG = "PROPERTY_TAX_GL_POSTING_ENABLED";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type Posting = {
  account_id: string;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description?: string | null;
};

export type PropertyTaxPostResult = {
  posted: boolean;
  reason?: "flag_off" | "already_posted" | "zero_amount" | "rendition_not_found" | "not_accrued";
  journal_entry_id?: string;
  memo?: string;
};

const FLAG_OFF: PropertyTaxPostResult = { posted: false, reason: "flag_off" };

// ── Pure balanced-posting builders (no DB, no GL math beyond mirroring the amount as Dr/Cr). Unit-tested. ──

/** ACCRUAL — Dr Property Taxes (expense) / Cr Property Tax Payable (liability). Balanced by construction. */
export function buildPropertyTaxAccrualPostings(
  expenseAccountId: string,
  payableAccountId: string,
  amountCents: number,
  memo: string
): Posting[] {
  return [
    { account_id: expenseAccountId, debit_or_credit: "debit", amount_cents: amountCents, description: `${memo} — property tax expense` },
    { account_id: payableAccountId, debit_or_credit: "credit", amount_cents: amountCents, description: `${memo} — property tax payable` },
  ];
}

/** PAYMENT — Dr Property Tax Payable (liability) / Cr Cash. When paid cash-basis (no prior accrual), pass
 *  the expense account as `debitAccountId` instead of the payable. Balanced by construction. */
export function buildPropertyTaxPaymentPostings(
  debitAccountId: string,
  cashAccountId: string,
  amountCents: number,
  memo: string
): Posting[] {
  return [
    { account_id: debitAccountId, debit_or_credit: "debit", amount_cents: amountCents, description: `${memo} — settle property tax` },
    { account_id: cashAccountId, debit_or_credit: "credit", amount_cents: amountCents, description: `${memo} — cash paid to county` },
  ];
}

async function postingEnabled(client: DbClient, operatingCompanyId: string): Promise<boolean> {
  return isEnabled(client as never, PROPERTY_TAX_GL_POSTING_FLAG, { operating_company_id: operatingCompanyId });
}

// Idempotency: an auto property-tax JE is uniquely identified by its deterministic memo. If one already
// exists for this (rendition, step) we do not post again — no double-post on a re-run.
async function journalEntryExistsByMemo(client: DbClient, operatingCompanyId: string, memo: string): Promise<boolean> {
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM accounting.journal_entries
      WHERE operating_company_id = $1::uuid
        AND source = 'auto'
        AND memo = $2
        AND status <> 'voided'
      LIMIT 1
    `,
    [operatingCompanyId, memo]
  );
  return Boolean(res.rows[0]?.id);
}

type RenditionRow = {
  id: string;
  tax_year: number;
  assessed_tax_cents: number | null;
  cad_name: string;
};

async function loadRendition(client: DbClient, operatingCompanyId: string, renditionId: string): Promise<RenditionRow | null> {
  const res = await client.query<RenditionRow>(
    `
      SELECT r.id::text, r.tax_year, r.assessed_tax_cents, d.cad_name
      FROM compliance.property_tax_renditions r
      JOIN compliance.appraisal_districts d ON d.id = r.appraisal_district_id
      WHERE r.operating_company_id = $1::uuid AND r.id = $2::uuid AND r.is_active
      LIMIT 1
    `,
    [operatingCompanyId, renditionId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return { ...row, assessed_tax_cents: row.assessed_tax_cents == null ? null : Number(row.assessed_tax_cents) };
}

export type PostPropertyTaxAccrualInput = {
  operating_company_id: string;
  rendition_id: string;
  entry_date_iso: string; // 'YYYY-MM-DD' — the accrual date
  actor_user_id: string;
};

/** Accrue the CAD-assessed property tax: Dr Property Taxes / Cr Property Tax Payable. INERT while the flag
 *  is OFF (returns {posted:false, reason:'flag_off'} — zero writes). Amount = rendition.assessed_tax_cents. */
export async function postPropertyTaxAccrual(input: PostPropertyTaxAccrualInput): Promise<PropertyTaxPostResult> {
  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    if (!(await postingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    const rendition = await loadRendition(client, input.operating_company_id, input.rendition_id);
    if (!rendition) return { gate: "rendition_not_found" as const };

    const amount = Number(rendition.assessed_tax_cents ?? 0);
    if (amount <= 0) return { gate: "zero_amount" as const };

    const entryDate = input.entry_date_iso.slice(0, 10);
    const memo = `Property tax accrual — ${rendition.cad_name} ${rendition.tax_year}`;
    if (await journalEntryExistsByMemo(client, input.operating_company_id, memo)) return { gate: "already_posted" as const };

    const expenseAccountId = await resolveRoleAccount(client, input.operating_company_id, "property_tax_expense");
    const payableAccountId = await resolveRoleAccount(client, input.operating_company_id, "property_tax_payable");

    return {
      gate: "post" as const,
      memo,
      entryDate,
      amount,
      taxYear: rendition.tax_year,
      postings: buildPropertyTaxAccrualPostings(expenseAccountId, payableAccountId, amount, memo),
    };
  });

  if (prepared.gate === "flag_off") return FLAG_OFF;
  if (prepared.gate === "rendition_not_found") return { posted: false, reason: "rendition_not_found" };
  if (prepared.gate === "zero_amount") return { posted: false, reason: "zero_amount" };
  if (prepared.gate === "already_posted") return { posted: false, reason: "already_posted" };

  const created = await createJournalEntry(
    {
      operating_company_id: input.operating_company_id,
      entry_date: prepared.entryDate,
      memo: prepared.memo,
      source: "auto",
      postings: prepared.postings,
    },
    { userId: input.actor_user_id, role: "system" }
  );

  // Ledger + connectivity: accrual → JE → rendition. ON CONFLICT no-ops a retry (unique on rendition).
  await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    await client.query(
      `
        INSERT INTO accounting.property_tax_accruals (
          operating_company_id, rendition_id, tax_year, accrual_date, tax_amount_cents,
          accrual_je_id, status, memo, created_by_user_id
        )
        VALUES ($1::uuid, $2::uuid, $3, $4::date, $5, $6::uuid, 'accrued', $7, $8::uuid)
        ON CONFLICT (operating_company_id, rendition_id) WHERE is_active DO UPDATE
          SET accrual_je_id = EXCLUDED.accrual_je_id, tax_amount_cents = EXCLUDED.tax_amount_cents, updated_at = now()
      `,
      [
        input.operating_company_id,
        input.rendition_id,
        prepared.taxYear,
        prepared.entryDate,
        prepared.amount,
        created.id,
        prepared.memo,
        input.actor_user_id,
      ]
    );
    await appendCrudAudit(client as Parameters<typeof appendCrudAudit>[0], input.actor_user_id, "accounting.property_tax_accrual.posted", {
      renditionId: input.rendition_id,
      operatingCompanyId: input.operating_company_id,
      journalEntryId: created.id,
      tax_amount_cents: prepared.amount,
      tax_year: prepared.taxYear,
    });
  });

  return { posted: true, journal_entry_id: created.id, memo: prepared.memo };
}

export type PostPropertyTaxPaymentInput = {
  operating_company_id: string;
  rendition_id: string;
  entry_date_iso: string; // 'YYYY-MM-DD' — the payment date
  actor_user_id: string;
  /** Cash-basis: no prior accrual → Dr Property Taxes (expense) / Cr Cash instead of Dr Payable / Cr Cash. */
  direct_from_expense?: boolean;
};

/** Pay the property tax to the county: Dr Property Tax Payable / Cr Cash (or Dr Expense / Cr Cash cash-basis).
 *  INERT while the flag is OFF. Amount = the accrued row's tax_amount_cents (or the rendition assessment). */
export async function postPropertyTaxPayment(input: PostPropertyTaxPaymentInput): Promise<PropertyTaxPostResult> {
  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    if (!(await postingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    const rendition = await loadRendition(client, input.operating_company_id, input.rendition_id);
    if (!rendition) return { gate: "rendition_not_found" as const };

    // Prefer the accrued amount; fall back to the rendition assessment for a cash-basis direct payment.
    const accrualRes = await client.query<{ tax_amount_cents: number; status: string }>(
      `SELECT tax_amount_cents, status FROM accounting.property_tax_accruals
       WHERE operating_company_id = $1::uuid AND rendition_id = $2::uuid AND is_active LIMIT 1`,
      [input.operating_company_id, input.rendition_id]
    );
    const accrual = accrualRes.rows[0];
    if (!input.direct_from_expense && !accrual) return { gate: "not_accrued" as const };

    const amount = Number(accrual?.tax_amount_cents ?? rendition.assessed_tax_cents ?? 0);
    if (amount <= 0) return { gate: "zero_amount" as const };

    const entryDate = input.entry_date_iso.slice(0, 10);
    const memo = `Property tax payment — ${rendition.cad_name} ${rendition.tax_year}`;
    if (await journalEntryExistsByMemo(client, input.operating_company_id, memo)) return { gate: "already_posted" as const };

    const debitAccountId = input.direct_from_expense
      ? await resolveRoleAccount(client, input.operating_company_id, "property_tax_expense")
      : await resolveRoleAccount(client, input.operating_company_id, "property_tax_payable");
    const cashAccountId = await resolveRoleAccount(client, input.operating_company_id, "cash_clearing");

    return {
      gate: "post" as const,
      memo,
      entryDate,
      amount,
      hasAccrual: Boolean(accrual),
      postings: buildPropertyTaxPaymentPostings(debitAccountId, cashAccountId, amount, memo),
    };
  });

  if (prepared.gate === "flag_off") return FLAG_OFF;
  if (prepared.gate === "rendition_not_found") return { posted: false, reason: "rendition_not_found" };
  if (prepared.gate === "not_accrued") return { posted: false, reason: "not_accrued" };
  if (prepared.gate === "zero_amount") return { posted: false, reason: "zero_amount" };
  if (prepared.gate === "already_posted") return { posted: false, reason: "already_posted" };

  const created = await createJournalEntry(
    {
      operating_company_id: input.operating_company_id,
      entry_date: prepared.entryDate,
      memo: prepared.memo,
      source: "auto",
      postings: prepared.postings,
    },
    { userId: input.actor_user_id, role: "system" }
  );

  if (prepared.hasAccrual) {
    await withLuciaBypass(async (client: DbClient) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
      await client.query(
        `
          UPDATE accounting.property_tax_accruals
          SET payment_je_id = $3::uuid, payment_date = $4::date, status = 'paid', updated_at = now()
          WHERE operating_company_id = $1::uuid AND rendition_id = $2::uuid AND is_active
        `,
        [input.operating_company_id, input.rendition_id, created.id, prepared.entryDate]
      );
      await appendCrudAudit(client as Parameters<typeof appendCrudAudit>[0], input.actor_user_id, "accounting.property_tax_payment.posted", {
        renditionId: input.rendition_id,
        operatingCompanyId: input.operating_company_id,
        journalEntryId: created.id,
        payment_date: prepared.entryDate,
      });
    });
  }

  return { posted: true, journal_entry_id: created.id, memo: prepared.memo };
}
