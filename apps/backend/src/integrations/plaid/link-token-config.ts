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

export function buildLinkTokenCreateRequestBase(webhookUrl: string): {
  client_name: string;
  country_codes: CountryCode[];
  language: string;
  webhook: string;
} {
  return {
    client_name: "IH35 TMS",
    country_codes: [CountryCode.Us],
    language: "en",
    webhook: webhookUrl,
  };
}
