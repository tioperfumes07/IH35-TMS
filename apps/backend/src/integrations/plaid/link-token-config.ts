import { CountryCode, CreditAccountSubtype, DepositoryAccountSubtype, Products } from "plaid";

export type PlaidLinkAccountType = "bank" | "credit_card" | "all";

export function resolvePlaidLinkAccountType(raw: string | undefined): PlaidLinkAccountType {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "credit_card" || value === "creditcard") return "credit_card";
  if (value === "all") return "all";
  return "bank";
}

export function buildLinkTokenCreateCore(accountType: PlaidLinkAccountType): {
  products: Products[];
  account_filters?: {
    credit?: { account_subtypes: CreditAccountSubtype[] };
    depository?: { account_subtypes: DepositoryAccountSubtype[] };
  };
} {
  if (accountType === "bank") {
    return {
      products: [Products.Transactions, Products.Auth],
      account_filters: {
        depository: {
          account_subtypes: [DepositoryAccountSubtype.Checking, DepositoryAccountSubtype.Savings],
        },
      },
    };
  }

  if (accountType === "credit_card") {
    return {
      products: [Products.Transactions],
      account_filters: {
        credit: {
          account_subtypes: [CreditAccountSubtype.CreditCard],
        },
      },
    };
  }

  return {
    products: [Products.Transactions],
  };
}

// How far back Plaid pulls transaction history at link time. Owner-editable via the env var
// PLAID_TRANSACTIONS_DAYS_REQUESTED (Render) WITHOUT a code change. Plaid allows 1..730 (24 months);
// default 730 = pull the maximum. NOTE: the institution still caps what it actually returns
// (Bank of America ~12 months); anything older comes in via CSV backfill (dual-ingestion rule).
export function resolveTransactionsDaysRequested(): number {
  const raw = Number(process.env.PLAID_TRANSACTIONS_DAYS_REQUESTED ?? 730);
  if (!Number.isFinite(raw)) return 730;
  return Math.min(730, Math.max(1, Math.trunc(raw)));
}

export function buildLinkTokenCreateRequestBase(webhookUrl: string): {
  client_name: string;
  country_codes: CountryCode[];
  language: string;
  webhook: string;
  transactions: { days_requested: number };
} {
  return {
    client_name: "IH35 TMS",
    country_codes: [CountryCode.Us],
    language: "en",
    webhook: webhookUrl,
    transactions: { days_requested: resolveTransactionsDaysRequested() },
  };
}
