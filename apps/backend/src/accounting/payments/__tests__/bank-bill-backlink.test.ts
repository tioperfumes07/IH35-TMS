import { describe, expect, it, vi } from "vitest";
import { backlinkBankTransactionToBill } from "../bank-bill-backlink.service.js";

const OPCO = "11111111-1111-4111-8111-111111111111";
const BILL_PAY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const BILL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BANK_TX = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("backlinkBankTransactionToBill", () => {
  it("fills matched_bill_id only when the bill payment names one source bank line", async () => {
    const query = vi.fn(async (sql: string) => {
      const s = String(sql);
      if (s.includes("FROM accounting.bill_payments") && s.includes("source_bank_transaction_id")) {
        return { rows: [{ source_bank_transaction_id: BANK_TX }] };
      }
      if (s.includes("UPDATE banking.bank_transactions") && s.includes("matched_bill_id")) {
        return { rows: [{ id: BANK_TX }], rowCount: 1 };
      }
      return { rows: [] };
    });

    const result = await backlinkBankTransactionToBill({ query }, OPCO, BILL_PAY, [BILL]);
    expect(result).toEqual({ linked: true, bank_transaction_id: BANK_TX, bill_id: BILL });
    const upd = query.mock.calls.find(([sql]) => String(sql).includes("matched_bill_id IS NULL"));
    expect(upd?.[1]).toEqual([BILL, BILL_PAY, BANK_TX, OPCO]);
  });

  it("refuses several bills rather than inventing one matched_bill_id", async () => {
    const query = vi.fn();
    const result = await backlinkBankTransactionToBill({ query }, OPCO, BILL_PAY, [BILL, "99999999-9999-4999-8999-999999999999"]);
    expect(result).toMatchObject({ linked: false, reason: "no_single_bill" });
    expect(query).not.toHaveBeenCalled();
  });

  it("never throws into the money path", async () => {
    const query = vi.fn(async () => {
      throw new Error("db_down");
    });
    const result = await backlinkBankTransactionToBill({ query }, OPCO, BILL_PAY, [BILL]);
    expect(result).toMatchObject({ linked: false, reason: "error", detail: "db_down" });
  });
});
