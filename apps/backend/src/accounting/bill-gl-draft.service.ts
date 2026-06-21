// CHAIN-03 STEP-1 — Create Bill → GL DRAFT proof (TRANSPORTATION ONLY).
//
// This module COMPUTES the journal entry a TRANSP bill WOULD post and returns it as a DRAFT.
// It WRITES NOTHING — no journal entry, no posting batch, no rows. STEP-2 (the actual post,
// behind BILL_GL_POSTING_ENABLED) is out of scope here and is a separate, Jorge-gated change.
//
// Resolution (Jorge's CHAIN-03 spec, verbatim — resolve by ROLE / category-map, never by name/id):
//   • Each bill line is a DEBIT to its expense account, resolved via the B1
//     expense_category_account_map (`resolveAccountForCategory`).
//   • A line with NO category → DEBIT `uncategorized_expense` role (QBO-25).
//   • A line WITH a category that has no active map entry → FAIL LOUD (no silent fallback).
//   • One summed CREDIT to A/P, resolved via the `ap_control` role (TRANSP → 2000).
//   • Missing ap_control / missing uncategorized_expense role → FAIL LOUD.
// The draft must balance (Σ debits === Σ credits) or it throws.
//
// SCOPE LOCK: TRANSPORTATION ONLY. TRK + USMCA are cloned later (Jorge: "we finish transportation,
// then we clone for trucking and usmca"). The route enforces the entity guard.

import {
  resolveAccountForCategory,
  ExpenseCategoryMapResolutionError,
  type ExpenseCategoryMapKind,
} from "./expense-category-map/resolver.service.js";
import { resolveRoleAccountOptional } from "./coa-roles/resolver.service.js";

// TRANSP operating company (CLAUDE.md §6). STEP-1 is locked to this entity.
export const TRANSP_OPERATING_COMPANY_ID = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type BillDraftLineSpec = {
  category_kind?: ExpenseCategoryMapKind | null;
  category_code?: string | null;
  amount_cents: number;
  description?: string | null;
};

export type BillDraftSpec = {
  bill_label?: string | null;
  posting_date?: string | null;
  lines: BillDraftLineSpec[];
};

export type DraftResolutionMethod =
  | "expense_category_map"
  | "uncategorized_expense_role"
  | "ap_control_role";

export type DraftJeLine = {
  account_id: string;
  account_number: string;
  account_name: string;
  debit_cents: number;
  credit_cents: number;
  amount_cents: number;
  category_label: string;
  resolution_method: DraftResolutionMethod;
  description: string | null;
};

export type BillGlDraft = {
  operating_company_id: string;
  bill_label: string;
  posting_date: string | null;
  lines: DraftJeLine[];
  total_debits_cents: number;
  total_credits_cents: number;
  balanced: boolean;
  // STEP-1 invariant — this path never writes to the ledger.
  writes_nothing: true;
};

export type BillGlDraftErrorCode =
  | "EMPTY_BILL"
  | "INVALID_AMOUNT"
  | "AP_UNRESOLVED"
  | "UNCATEGORIZED_UNRESOLVED"
  | "CATEGORY_MAPPING_MISSING"
  | "ACCOUNT_NOT_FOUND"
  | "UNBALANCED";

export class BillGlDraftError extends Error {
  code: BillGlDraftErrorCode;

  constructor(code: BillGlDraftErrorCode, message: string) {
    super(message);
    this.name = "BillGlDraftError";
    this.code = code;
  }
}

type AccountRef = { account_id: string; account_number: string; account_name: string };

type ResolvedDebit = AccountRef & {
  amount_cents: number;
  category_label: string;
  resolution_method: Exclude<DraftResolutionMethod, "ap_control_role">;
  description: string | null;
};

// Pure JE assembler (no DB) — the testable core of the proof. Builds one DEBIT line per resolved
// bill line + a single summed CREDIT to A/P, asserts the entry is non-empty and balances.
export function buildBillJeDraft(input: {
  operating_company_id: string;
  bill_label: string;
  posting_date: string | null;
  debits: ResolvedDebit[];
  ap: AccountRef;
}): BillGlDraft {
  if (input.debits.length === 0) {
    throw new BillGlDraftError("EMPTY_BILL", "Bill has no lines — nothing to post");
  }
  for (const d of input.debits) {
    if (!Number.isInteger(d.amount_cents) || d.amount_cents <= 0) {
      throw new BillGlDraftError(
        "INVALID_AMOUNT",
        `Bill line amount_cents must be a positive integer (got ${d.amount_cents})`
      );
    }
  }

  const lines: DraftJeLine[] = input.debits.map((d) => ({
    account_id: d.account_id,
    account_number: d.account_number,
    account_name: d.account_name,
    debit_cents: d.amount_cents,
    credit_cents: 0,
    amount_cents: d.amount_cents,
    category_label: d.category_label,
    resolution_method: d.resolution_method,
    description: d.description,
  }));

  const apTotal = input.debits.reduce((sum, d) => sum + d.amount_cents, 0);
  lines.push({
    account_id: input.ap.account_id,
    account_number: input.ap.account_number,
    account_name: input.ap.account_name,
    debit_cents: 0,
    credit_cents: apTotal,
    amount_cents: apTotal,
    category_label: "Accounts Payable (ap_control)",
    resolution_method: "ap_control_role",
    description: `${input.bill_label} A/P`,
  });

  const totalDebits = lines.reduce((sum, l) => sum + l.debit_cents, 0);
  const totalCredits = lines.reduce((sum, l) => sum + l.credit_cents, 0);
  const balanced = totalDebits === totalCredits && totalDebits > 0;
  if (!balanced) {
    throw new BillGlDraftError(
      "UNBALANCED",
      `Draft JE is unbalanced (debits=${totalDebits}, credits=${totalCredits})`
    );
  }

  return {
    operating_company_id: input.operating_company_id,
    bill_label: input.bill_label,
    posting_date: input.posting_date,
    lines,
    total_debits_cents: totalDebits,
    total_credits_cents: totalCredits,
    balanced,
    writes_nothing: true,
  };
}

async function accountRef(client: DbClient, accountId: string): Promise<AccountRef> {
  const res = await client.query<{ account_number: string | null; account_name: string | null }>(
    `SELECT account_number::text AS account_number, account_name::text AS account_name
       FROM catalogs.accounts
      WHERE id = $1::uuid
      LIMIT 1`,
    [accountId]
  );
  const row = res.rows[0];
  if (!row) {
    throw new BillGlDraftError(
      "ACCOUNT_NOT_FOUND",
      `Resolved account ${accountId} not found in catalogs.accounts`
    );
  }
  return { account_id: accountId, account_number: row.account_number ?? "", account_name: row.account_name ?? "" };
}

// Resolve a sample/real TRANSP bill spec into the balanced draft JE, reading the LIVE role +
// category maps. `client` must already be entity-scoped (withCompanyScope) so RLS sees TRANSP rows.
export async function computeBillGlDraft(
  client: DbClient,
  operatingCompanyId: string,
  spec: BillDraftSpec
): Promise<BillGlDraft> {
  if (!spec.lines || spec.lines.length === 0) {
    throw new BillGlDraftError("EMPTY_BILL", "Bill has no lines — nothing to post");
  }

  // CREDIT side first — fail loud if A/P (ap_control) is unmapped before doing any line work.
  const apId = await resolveRoleAccountOptional(client, operatingCompanyId, "ap_control");
  if (!apId) {
    throw new BillGlDraftError(
      "AP_UNRESOLVED",
      "ap_control role is not mapped for this entity — cannot credit A/P (FAIL LOUD)"
    );
  }
  const ap = await accountRef(client, apId);

  const debits: ResolvedDebit[] = [];
  for (let i = 0; i < spec.lines.length; i++) {
    const line = spec.lines[i];
    if (!Number.isInteger(line.amount_cents) || line.amount_cents <= 0) {
      throw new BillGlDraftError(
        "INVALID_AMOUNT",
        `Line ${i + 1}: amount_cents must be a positive integer (got ${line.amount_cents})`
      );
    }

    const kind = line.category_kind ?? null;
    const code = line.category_code?.trim() || null;

    let ref: AccountRef;
    let method: ResolvedDebit["resolution_method"];
    let label: string;

    if (!kind || !code) {
      // Uncategorized line → QBO-25 uncategorized_expense role (a legitimate bucket, not an error).
      const uncategorized = await resolveRoleAccountOptional(client, operatingCompanyId, "uncategorized_expense");
      if (!uncategorized) {
        throw new BillGlDraftError(
          "UNCATEGORIZED_UNRESOLVED",
          "uncategorized_expense role (QBO-25) is not mapped — cannot place an uncategorized line (FAIL LOUD)"
        );
      }
      ref = await accountRef(client, uncategorized);
      method = "uncategorized_expense_role";
      label = "Uncategorized expense (QBO-25)";
    } else {
      // Specified category MUST resolve via the expense_category_account_map. A missing mapping is a
      // config error that must surface — NEVER silently bucket it to uncategorized.
      try {
        const mapped = await resolveAccountForCategory(operatingCompanyId, kind, code);
        ref = await accountRef(client, mapped.account_id);
        method = "expense_category_map";
        label = `${kind}/${code}`;
      } catch (err) {
        if (err instanceof ExpenseCategoryMapResolutionError) {
          throw new BillGlDraftError(
            "CATEGORY_MAPPING_MISSING",
            `Line ${i + 1}: category ${kind}/${code} has no active expense_category_account_map entry — FAIL LOUD (no silent fallback)`
          );
        }
        throw err;
      }
    }

    debits.push({
      ...ref,
      amount_cents: line.amount_cents,
      category_label: label,
      resolution_method: method,
      description: line.description ?? null,
    });
  }

  return buildBillJeDraft({
    operating_company_id: operatingCompanyId,
    bill_label: spec.bill_label?.trim() || "Draft bill",
    posting_date: spec.posting_date ?? null,
    debits,
    ap,
  });
}
