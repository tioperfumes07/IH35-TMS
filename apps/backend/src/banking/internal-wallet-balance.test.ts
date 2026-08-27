import { describe, expect, it } from "vitest";
import {
  deriveInternalWalletBalanceCents,
  sumAuthoritativeDepositoryCashCents,
  withInternalWalletBalances,
  withInternalWalletTileBalances,
} from "./internal-wallet-balance.js";

const COMPANY_ID = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const WALLET_ID = "112629fa-05a3-499a-bdac-91d696a21b6b";

/** Mirrors the real prod shape found on the Relay Fuel Wallet: 108 credit rows (deposits) totaling
 *  $446,896.99 and 1,472 debit rows (fuel draws) totaling $600,830.66 — net -$153,933.67. */
function mockClient(rows: Array<{ bank_account_id: string; balance_cents: string }>) {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  return {
    client: {
      async query(sql: string, values?: unknown[]) {
        queries.push({ sql, values });
        return { rows };
      },
    },
    queries,
  };
}

describe("internal-wallet-balance", () => {
  it("derives a single non-Plaid wallet's balance from its ledger (credits - debits)", async () => {
    const { client, queries } = mockClient([{ bank_account_id: WALLET_ID, balance_cents: "-15393367" }]);
    const cents = await deriveInternalWalletBalanceCents(client, COMPANY_ID, WALLET_ID);
    expect(cents).toBe(-15393367);
    expect(queries[0]?.sql).toContain("is_credit");
    expect(queries[0]?.sql).toContain("banking.bank_transactions");
  });

  it("returns 0 for a wallet with no transactions instead of throwing", async () => {
    const { client } = mockClient([]);
    const cents = await deriveInternalWalletBalanceCents(client, COMPANY_ID, WALLET_ID);
    expect(cents).toBe(0);
  });

  it("overrides only non-Plaid accounts, leaving Plaid-linked accounts untouched", async () => {
    const { client } = mockClient([{ bank_account_id: WALLET_ID, balance_cents: "-15393367" }]);
    const accounts = [
      { id: WALLET_ID, plaid_item_id: null, current_balance_cents: "0", available_balance_cents: "0" },
      {
        id: "40b01d57-c27c-4bf1-922a-246543fddd83",
        plaid_item_id: "some-plaid-item",
        current_balance_cents: "538",
        available_balance_cents: "538",
      },
    ];
    const result = await withInternalWalletBalances(client, COMPANY_ID, accounts);

    const wallet = result.find((a) => a.id === WALLET_ID);
    expect(wallet?.current_balance_cents).toBe("-15393367");
    expect(wallet?.available_balance_cents).toBe("-15393367");

    const plaidAccount = result.find((a) => a.plaid_item_id === "some-plaid-item");
    expect(plaidAccount?.current_balance_cents).toBe("538");
    expect(plaidAccount?.available_balance_cents).toBe("538");
  });

  it("skips the query entirely when every account is Plaid-linked (no wasted round trip)", async () => {
    const { client, queries } = mockClient([]);
    const accounts = [
      { id: "a", plaid_item_id: "item-1", current_balance_cents: "100", available_balance_cents: "100" },
    ];
    const result = await withInternalWalletBalances(client, COMPANY_ID, accounts);
    expect(result).toBe(accounts);
    expect(queries.length).toBe(0);
  });

  it("overrides only non-Plaid real tile balances to dollars for aggregate reconciliation", async () => {
    const { client } = mockClient([{ bank_account_id: WALLET_ID, balance_cents: "-15393367" }]);
    const tiles = [
      {
        id: WALLET_ID,
        tile_kind: "real",
        current_balance: 0,
        plaid_item_id: null,
      },
      {
        id: "00000000-0000-0000-0000-000000000059",
        tile_kind: "virtual",
        current_balance: 500,
        plaid_item_id: null,
      },
      {
        id: "40b01d57-c27c-4bf1-922a-246543fddd83",
        tile_kind: "real",
        current_balance: 5.38,
        plaid_item_id: "plaid-item",
      },
    ];
    const result = await withInternalWalletTileBalances(client, COMPANY_ID, tiles);
    expect(result[0]?.current_balance).toBe(-153933.67);
    expect(result[1]?.current_balance).toBe(500);
    expect(result[2]?.current_balance).toBe(5.38);
  });

  // BANK-KPI-FAKE-ZERO-CATCH-CLUSTER: sumAuthoritativeDepositoryCashCents used to swallow both of its
  // internal queries with `.catch(() => ({ rows: [{ ... : 0 }] }))`, so a real DB failure silently
  // became "$0 depository cash" -- a number indistinguishable from an actually-empty account, fed
  // into the /banking KPI strip, /cash-flow opening cash, and /accounts/all at once. It must now fail
  // loud (reject) instead of resolving to a masked zero.
  it("BANK-KPI-FAKE-ZERO-CATCH-CLUSTER: rejects instead of masking a failed Plaid-depository query as $0", async () => {
    const client = {
      async query(sql: string) {
        if (sql.includes("current_balance_cents")) throw new Error("simulated connection failure");
        return { rows: [{ internal_total: "0" }] };
      },
    };
    await expect(
      sumAuthoritativeDepositoryCashCents(client, COMPANY_ID, { hideFilterOnBankAccounts: "", hideFilterOnBaAlias: "" })
    ).rejects.toThrow("simulated connection failure");
  });

  it("BANK-KPI-FAKE-ZERO-CATCH-CLUSTER: rejects instead of masking a failed internal-wallet-ledger query as $0", async () => {
    const client = {
      async query(sql: string) {
        if (sql.includes("bt.is_credit")) throw new Error("simulated connection failure");
        return { rows: [{ total_cash: "0" }] };
      },
    };
    await expect(
      sumAuthoritativeDepositoryCashCents(client, COMPANY_ID, { hideFilterOnBankAccounts: "", hideFilterOnBaAlias: "" })
    ).rejects.toThrow("simulated connection failure");
  });

  it("still sums both legs correctly on the happy path (no regression from removing the catches)", async () => {
    const client = {
      async query(sql: string) {
        if (sql.includes("current_balance_cents")) return { rows: [{ total_cash: "500000" }] };
        return { rows: [{ internal_total: "-15393367" }] };
      },
    };
    const cents = await sumAuthoritativeDepositoryCashCents(client, COMPANY_ID, {
      hideFilterOnBankAccounts: "",
      hideFilterOnBaAlias: "",
    });
    expect(cents).toBe(500000 + -15393367);
  });
});
