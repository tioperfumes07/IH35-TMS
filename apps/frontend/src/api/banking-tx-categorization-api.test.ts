import * as client from "./client";
import {
  bulkCategorizeBankTransactions,
  categorizeBankTransactionToAccount,
  getBankingUncategorized,
  markBankTransactionTransfer,
} from "./banking";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("banking tx categorization API client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("getBankingUncategorized GETs with filters", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ transactions: [] } as never);
    await getBankingUncategorized("co-1", { bank_account_id: "acct-1", date_from: "2026-01-01", limit: 10 });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/banking/transactions/uncategorized?")
    );
    const url = String(spy.mock.calls[0]?.[0]);
    expect(url).toContain("operating_company_id=co-1");
    expect(url).toContain("bank_account_id=acct-1");
    expect(url).toContain("date_from=2026-01-01");
    expect(url).toContain("limit=10");
  });

  it("categorizeBankTransactionToAccount POSTs account_id", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ ok: true } as never);
    await categorizeBankTransactionToAccount("tx-1", "co-1", { account_id: "acc-1", memo: "m" });
    expect(spy).toHaveBeenCalledWith(
      "/api/v1/banking/transactions/tx-1/categorize?operating_company_id=co-1",
      { method: "POST", body: { account_id: "acc-1", memo: "m" } }
    );
  });

  it("bulkCategorizeBankTransactions POSTs ids + account", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ ok: true } as never);
    await bulkCategorizeBankTransactions("co-1", { transaction_ids: ["a", "b"], account_id: "acc-1" });
    expect(spy).toHaveBeenCalledWith("/api/v1/banking/transactions/bulk-categorize?operating_company_id=co-1", {
      method: "POST",
      body: { transaction_ids: ["a", "b"], account_id: "acc-1" },
    });
  });

  it("markBankTransactionTransfer POSTs accounts", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ ok: true } as never);
    await markBankTransactionTransfer("tx-9", "co-1", { from_account_id: "b1", to_account_id: "b2" });
    expect(spy).toHaveBeenCalledWith("/api/v1/banking/transactions/tx-9/mark-transfer?operating_company_id=co-1", {
      method: "POST",
      body: { from_account_id: "b1", to_account_id: "b2" },
    });
  });
});
