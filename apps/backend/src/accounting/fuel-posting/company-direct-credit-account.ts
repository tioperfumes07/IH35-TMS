/** Fuel company-direct credit account resolution — leaf module to break the fuel posting import cycle. */
import { resolveRoleAccount, resolveRoleAccountOptional } from "../coa-roles/resolver.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type CompanyDirectCredit = "cash" | "dreamline_card_payable" | "relay_fuel_wallet";

async function resolveFuelCardRailAccount(
  client: DbClient,
  operatingCompanyId: string,
  rail: "dreamline_card_payable" | "relay_fuel_wallet"
): Promise<{ account_id: string; source: string }> {
  // ROUND 352 F-3: the Relay wallet resolves through its declared role (fuel_wallet_relay), never by account number —
  // 1295 had no role, which is how it drifted to -$33,839.80 unseen. resolveRoleAccount fails closed.
  if (rail === "relay_fuel_wallet") {
    return { account_id: await resolveRoleAccount(client, operatingCompanyId, "fuel_wallet_relay"), source: "role:fuel_wallet_relay" };
  }
  // ROUND 365.1 — Dreamline (2510 on USMCA) resolves through its role too, never by account number (202615370930).
  return {
    account_id: await resolveRoleAccount(client, operatingCompanyId, "fuel_card_payable_dreamline"),
    source: "role:fuel_card_payable_dreamline",
  };
}

export async function resolveCompanyDirectCreditAccount(
  client: DbClient,
  operatingCompanyId: string,
  preference: CompanyDirectCredit
): Promise<{ account_id: string; source: string }> {
  if (preference === "dreamline_card_payable" || preference === "relay_fuel_wallet") {
    return resolveFuelCardRailAccount(client, operatingCompanyId, preference);
  }

  // ROUND 377 (Lead, 2026-10-03) — THIS IS WHERE 1090 WENT TO -151,736.34.
  //
  // This used to resolve the `undeposited_funds` role for the CASH credit leg, and then fall back to a
  // subtype query that listed 'UndepositedFunds' FIRST among "cash like" accounts, ordered by
  // `updated_at DESC`. Measured consequence on production: 255 fuel_event postings credited 1090 for
  // 108,602.28, against a net balance of -151,736.34 on an ASSET.
  //
  // Undeposited Funds is one thing: money a CUSTOMER has paid us that has not yet reached the bank. It
  // is a holding pen on the way IN. Buying diesel involves no customer receipt, so nothing on the way
  // OUT belongs there — a fuel credit lands in it only by mistake, and a credit to an asset that was
  // never debited is exactly how it went negative.
  //
  // Cash fuel is paid from the BANK. Resolve `operating_bank` and nothing else.
  //
  // The `cash_like` fallback is deleted outright rather than reordered. It picked an account by
  // `updated_at DESC`, which means the account a posting landed in depended on which row happened to be
  // touched most recently — a coincidence, not a mapping. A poster that cannot resolve its role FAILS
  // CLOSED and says which role is unbound (365.1: the role is the contract; ROUND 29.9-B: a money path
  // that cannot resolve is a failure, never a quiet guess).
  const operatingBank = await resolveRoleAccountOptional(client, operatingCompanyId, "operating_bank");
  if (operatingBank) return { account_id: operatingBank, source: "role_designation:operating_bank" };

  throw new Error(
    "Company-direct CASH fuel posting cannot resolve its credit account: the 'operating_bank' role is " +
      `not bound for operating_company_id=${operatingCompanyId}. Bind it in accounting.chart_of_accounts_roles. ` +
      "Undeposited Funds is never the credit for a fuel purchase (ROUND 377) — it holds customer receipts " +
      "awaiting deposit, and crediting it here is what drove 1090 to a negative balance."
  );
}

