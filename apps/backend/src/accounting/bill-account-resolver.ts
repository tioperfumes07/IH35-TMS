// CHAIN-03 — THE ONE canonical bill-line debit-account resolver.
//
// There is exactly ONE account-resolution function for bills. BOTH the draft-JE preview
// (bill-gl-draft.service.ts) AND the actual poster (posting-engine.service.ts buildBillLines) call
// THIS function — so the preview is guaranteed to equal what posts. Do not add a second resolver;
// divergence = books that don't tie out. The CI guard `verify:bill-resolver-single-source` enforces
// that both consumers import from here and that the resolution order is defined only here.
//
// Resolution order (Jorge's CHAIN-03 fork decision — grounded in QBO/NetSuite, integrity over convenience):
//   1. bill_line explicit account override → honor it (QBO allows a per-line account).
//   2. line has a category → expense_category_account_map (the B1 map).
//   3. line has NO category → uncategorized_expense role (QBO-25) — QBO's "Uncategorized Expense" behavior.
//   4. line has a category but it's NOT in the map → FAIL LOUD (CATEGORY_MAPPING_MISSING). Never bucket.
// (A partially-specified category — exactly one of kind/code — is a data error → FAIL LOUD too.)
// The DROPPED tiers from the legacy buildBillLines — silent "header COA fallback" and "expense_default"
// — are intentionally gone: they hid misconfiguration (a mis-set category posted to a default unnoticed).

import {
  resolveAccountForCategory,
  ExpenseCategoryMapResolutionError,
  EXPENSE_CATEGORY_MAP_KIND_VALUES,
  type ExpenseCategoryMapKind,
} from "./expense-category-map/resolver.service.js";
import { resolveRoleAccountOptional } from "./coa-roles/resolver.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type BillLineForResolution = {
  // accounting.bill_lines.account_id (0220) — explicit per-line override.
  explicit_account_id?: string | null;
  // accounting.bill_lines.category_kind / category_code (0220) — the B1 map keys.
  category_kind?: string | null;
  category_code?: string | null;
};

export type BillLineDebitMethod =
  | "bill_line_explicit_account"
  | "expense_category_map"
  | "uncategorized_expense_role";

export type BillLineDebitResolution = {
  account_id: string;
  method: BillLineDebitMethod;
  category_label: string;
};

export type BillLineAccountErrorCode =
  | "CATEGORY_INCOMPLETE"
  | "CATEGORY_KIND_INVALID"
  | "CATEGORY_MAPPING_MISSING"
  | "UNCATEGORIZED_UNRESOLVED";

export class BillLineAccountError extends Error {
  code: BillLineAccountErrorCode;

  constructor(code: BillLineAccountErrorCode, message: string) {
    super(message);
    this.name = "BillLineAccountError";
    this.code = code;
  }
}

const VALID_KINDS = new Set<string>(EXPENSE_CATEGORY_MAP_KIND_VALUES);

export async function resolveBillLineDebitAccount(
  client: DbClient,
  operatingCompanyId: string,
  line: BillLineForResolution
): Promise<BillLineDebitResolution> {
  // Tier 1 — explicit per-line account override.
  const explicit = line.explicit_account_id?.trim() || null;
  if (explicit) {
    return { account_id: explicit, method: "bill_line_explicit_account", category_label: "Per-line account override" };
  }

  const kind = line.category_kind?.trim() || null;
  const code = line.category_code?.trim() || null;

  // Tier 3 — no category at all → uncategorized_expense (QBO-25).
  if (!kind && !code) {
    const uncategorized = await resolveRoleAccountOptional(client, operatingCompanyId, "uncategorized_expense");
    if (!uncategorized) {
      throw new BillLineAccountError(
        "UNCATEGORIZED_UNRESOLVED",
        "uncategorized_expense role (QBO-25) is not mapped — cannot place an uncategorized line (FAIL LOUD)"
      );
    }
    return { account_id: uncategorized, method: "uncategorized_expense_role", category_label: "Uncategorized expense (QBO-25)" };
  }

  // A partially-specified category is a data error — surface it, never silently bucket to uncategorized.
  if (!kind || !code) {
    throw new BillLineAccountError(
      "CATEGORY_INCOMPLETE",
      `Bill line has an incomplete category (kind=${kind ?? "∅"}, code=${code ?? "∅"}) — both are required. FAIL LOUD.`
    );
  }
  if (!VALID_KINDS.has(kind)) {
    throw new BillLineAccountError(
      "CATEGORY_KIND_INVALID",
      `Bill line category_kind "${kind}" is not a valid expense category kind — FAIL LOUD.`
    );
  }

  // Tier 2 — category present → expense_category_account_map. Tier 4 — present but unmapped → FAIL LOUD.
  try {
    const mapped = await resolveAccountForCategory(operatingCompanyId, kind as ExpenseCategoryMapKind, code);
    return { account_id: mapped.account_id, method: "expense_category_map", category_label: `${kind}/${code}` };
  } catch (err) {
    if (err instanceof ExpenseCategoryMapResolutionError) {
      throw new BillLineAccountError(
        "CATEGORY_MAPPING_MISSING",
        `Category ${kind}/${code} has no active expense_category_account_map entry — FAIL LOUD (no silent fallback).`
      );
    }
    throw err;
  }
}
