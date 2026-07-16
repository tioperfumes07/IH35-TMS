/**
 * Transfer From/To account option builders.
 *
 * QBO parity: Transfer Funds From/To lists bank accounts whether or not they are
 * bank-feed linked. Our prior path used Plaid-only accounts, which excluded
 * manual/system bank accounts (e.g. Relay Fuel Wallet — no plaid_account_id).
 *
 * Add-only: use ALL active banking.bank_accounts as kind=bank. For CoA Asset/
 * Liability extras (owner spec 2026-07-06), omit CoA rows already linked as a
 * bank account's ledger_account_id so the same wallet does not appear twice.
 */

export type TransferPickerKind = "bank" | "coa";

export type TransferPickerOption = {
  id: string;
  name: string;
  kind: TransferPickerKind;
};

export type BankAccountPickerRow = {
  id: string;
  display_name?: string | null;
  account_name?: string | null;
  institution_name?: string | null;
  account_mask?: string | null;
  ledger_account_id?: string | null;
};

export type CoaAccountPickerRow = {
  id: string;
  account_number?: string | null;
  account_name: string;
  account_type: string;
};

const TRANSFER_ELIGIBLE_COA_TYPES = new Set(["Asset", "Liability"]);

export function formatBankAccountPickerLabel(account: BankAccountPickerRow): string {
  const primary =
    String(account.display_name ?? "").trim() ||
    String(account.account_name ?? "").trim() ||
    "Account";
  const institution = String(account.institution_name ?? "").trim();
  const mask = String(account.account_mask ?? "").trim();
  const base = institution ? `${institution} - ${primary}` : primary;
  return mask ? `${base} ••••${mask}` : base;
}

export function buildBankTransferPickerOptions(input: {
  bankAccounts: BankAccountPickerRow[];
  coaAccounts: CoaAccountPickerRow[];
}): TransferPickerOption[] {
  const bankOptions: TransferPickerOption[] = input.bankAccounts.map((account) => ({
    id: String(account.id),
    name: formatBankAccountPickerLabel(account),
    kind: "bank",
  }));

  const linkedLedgerIds = new Set(
    input.bankAccounts
      .map((a) => (a.ledger_account_id != null ? String(a.ledger_account_id) : ""))
      .filter((id) => id.length > 0)
  );

  const coaOptions: TransferPickerOption[] = input.coaAccounts
    .filter((account) => TRANSFER_ELIGIBLE_COA_TYPES.has(String(account.account_type ?? "")))
    .filter((account) => !linkedLedgerIds.has(String(account.id)))
    .map((account) => ({
      id: String(account.id),
      name: `${account.account_number || "COA"} - ${account.account_name}`,
      kind: "coa",
    }));

  return [...bankOptions, ...coaOptions];
}
