/**
 * ROUND 441.21-B R5 — Relay↔bank Match engine tests (CHAIN-05).
 * Amounts use F442 wallet drawdown (paid + sender_fee). Floor 2026-08-03.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReverse } = vi.hoisted(() => ({
  mockReverse: vi.fn(async () => ({ result: "reversed" })),
}));
vi.mock("../../posting-engine.service.js", () => ({
  reversePostedSourceTransactionInClientTx: mockReverse,
}));

import {
  acceptRelayBankMatch,
  cardLast4FromBankText,
  cardLast4FromIntegrationId,
  recommendRelayBankMatch,
  rematchRelayBankMatch,
  RelayBankMatchRefusal,
  scanCategorizedLinesForAlreadyMatchedToBill,
} from "../relay-bank-match.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OTHER = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

type Q = { sql: string; values?: unknown[] };
type Hit = { rows: unknown[]; rowCount?: number } | null;

function makeClient(handlers: Array<(q: Q) => Hit>) {
  const calls: Q[] = [];
  return {
    calls,
    c: {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        const q = { sql, values };
        calls.push(q);
        for (const h of handlers) {
          const hit = h(q);
          if (hit) return hit;
        }
        return { rows: [], rowCount: 0 };
      }),
    },
  };
}

const bankBase = {
  id: "bank-1",
  operating_company_id: OPCO,
  transaction_date: "2026-09-10",
  amount_cents: -59633,
  description: "RELAY CARD ...1314 LOVE'S",
  merchant_name: "Relay",
  notes: null,
  matched_bill_id: null,
  matched_relay_fuel_transaction_id: null,
  matched_journal_entry_id: null,
  review_state: "for_review",
  status: "pending_categorization",
};

const fillBase = {
  id: "fill-1",
  operating_company_id: OPCO,
  fill_date: "2026-09-10",
  total_amount_paid_cents: 59433,
  fees: [{ type: "sender_fee", amount: "2.00" }],
  transaction_id: "txn_4ypX8FQCRzHr5n",
  relay_driver_integration_id: "6510420758981314",
  matched_unit_number: "T156",
  merchant_name: "Love's",
  line_fee_cents: 200,
};

describe("card last4 helpers", () => {
  it("reads last4 from Relay integration id", () => {
    expect(cardLast4FromIntegrationId("6510420758981314")).toBe("1314");
  });
  it("reads last4 from bank text", () => {
    expect(cardLast4FromBankText("RELAY CARD ...1314 LOVE'S")).toBe("1314");
  });
});

describe("R5 recommend / accept", () => {
  beforeEach(() => mockReverse.mockClear());

  it("exact single match links, no JE created", async () => {
    const { c } = makeClient([
      (q) => {
        if (q.sql.includes("matched_relay_fuel_transaction_id = $1")) return { rows: [] };
        if (q.sql.includes("FROM banking.bank_transactions") && q.sql.includes("LIMIT 1") && !q.sql.includes("UPDATE")) {
          return { rows: [bankBase] };
        }
        return null;
      },
      (q) => {
        if (q.sql.includes("FROM integrations.relay_fuel_transactions r") && q.sql.includes("BETWEEN")) {
          return { rows: [fillBase] };
        }
        return null;
      },
      (q) => {
        if (q.sql.includes("UPDATE banking.bank_transactions")) return { rows: [], rowCount: 1 };
        return null;
      },
      (q) => {
        if (q.sql.includes("INSERT INTO banking.reconciliation_matches")) return { rows: [], rowCount: 1 };
        return null;
      },
      (q) => {
        if (q.sql.includes("FROM integrations.relay_fuel_transactions r") && q.sql.includes("r.id = $1")) {
          return { rows: [fillBase] };
        }
        return null;
      },
    ]);

    const rec = await recommendRelayBankMatch(c as never, {
      operating_company_id: OPCO,
      bank_transaction_id: "bank-1",
    });
    expect(rec.status).toBe("exact");
    if (rec.status === "exact") {
      expect(rec.candidate.wallet_amount_cents).toBe(59633);
      expect(rec.candidate.exact_amount).toBe(true);
      expect(rec.candidate.last4_match).toBe(true);
      expect(rec.candidate.fields_matched).toEqual(expect.arrayContaining(["amount", "card_last4", "date"]));
    }

    const accepted = await acceptRelayBankMatch(c as never, {
      operating_company_id: OPCO,
      bank_transaction_id: "bank-1",
      relay_fuel_transaction_id: "fill-1",
      actor_user_uuid: "actor",
    });
    expect(accepted).toEqual({
      linked: true,
      bank_transaction_id: "bank-1",
      relay_fuel_transaction_id: "fill-1",
      journal_entry_created: false,
      expense_created: false,
    });
  });

  it("two candidates in window → operator choice, nothing posted", async () => {
    const fill2 = {
      ...fillBase,
      id: "fill-2",
      transaction_id: "txn_other",
      relay_driver_integration_id: "9999999999991314",
    };
    const { c } = makeClient([
      (q) => {
        if (q.sql.includes("FROM banking.bank_transactions") && q.sql.includes("LIMIT 1")) {
          return { rows: [bankBase] };
        }
        return null;
      },
      (q) => {
        if (q.sql.includes("FROM integrations.relay_fuel_transactions r") && q.sql.includes("BETWEEN")) {
          return { rows: [fillBase, fill2] };
        }
        return null;
      },
    ]);
    const rec = await recommendRelayBankMatch(c as never, {
      operating_company_id: OPCO,
      bank_transaction_id: "bank-1",
    });
    expect(rec.status).toBe("candidates");
    if (rec.status === "candidates") expect(rec.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("amount off by the $2 sender fee → matches after F442 (wallet = paid + fee)", async () => {
    const { c } = makeClient([
      (q) => {
        if (q.sql.includes("FROM banking.bank_transactions") && q.sql.includes("LIMIT 1")) {
          return { rows: [bankBase] };
        }
        return null;
      },
      (q) => {
        if (q.sql.includes("FROM integrations.relay_fuel_transactions r") && q.sql.includes("BETWEEN")) {
          return { rows: [fillBase] };
        }
        return null;
      },
    ]);
    const rec = await recommendRelayBankMatch(c as never, {
      operating_company_id: OPCO,
      bank_transaction_id: "bank-1",
    });
    expect(rec.status).toBe("exact");
    if (rec.status === "exact") {
      expect(rec.candidate.wallet_amount_cents).toBe(59633);
      expect(rec.candidate.bank_amount_cents).toBe(59633);
      expect(rec.candidate.amount_gap_cents).toBe(0);
    }
  });

  it("fill with no bank line → unmatched, named refusal", async () => {
    const { c } = makeClient([
      (q) => {
        if (q.sql.includes("FROM integrations.relay_fuel_transactions r") && q.sql.includes("r.id = $1")) {
          return { rows: [fillBase] };
        }
        return null;
      },
      (q) => {
        if (q.sql.includes("FROM banking.bank_transactions") && q.sql.includes("BETWEEN")) {
          return { rows: [] };
        }
        return null;
      },
    ]);
    const rec = await recommendRelayBankMatch(c as never, {
      operating_company_id: OPCO,
      relay_fuel_transaction_id: "fill-1",
    });
    expect(rec).toMatchObject({ status: "refused", code: "fill_unmatched" });
  });

  it("bank line with no fill → unmatched, named refusal", async () => {
    const { c } = makeClient([
      (q) => {
        if (q.sql.includes("FROM banking.bank_transactions") && q.sql.includes("LIMIT 1")) {
          return { rows: [bankBase] };
        }
        return null;
      },
      (q) => {
        if (q.sql.includes("FROM integrations.relay_fuel_transactions r") && q.sql.includes("BETWEEN")) {
          return { rows: [] };
        }
        return null;
      },
    ]);
    const rec = await recommendRelayBankMatch(c as never, {
      operating_company_id: OPCO,
      bank_transaction_id: "bank-1",
    });
    expect(rec).toMatchObject({ status: "refused", code: "bank_line_unmatched" });
  });

  it("already linked to a document → refusal already_matched_to_bill, reports line id", async () => {
    const billed = { ...bankBase, matched_bill_id: "bill-99" };
    const { c } = makeClient([
      (q) => {
        if (q.sql.includes("FROM banking.bank_transactions") && q.sql.includes("LIMIT 1")) {
          return { rows: [billed] };
        }
        return null;
      },
    ]);
    const rec = await recommendRelayBankMatch(c as never, {
      operating_company_id: OPCO,
      bank_transaction_id: "bank-1",
    });
    expect(rec.status).toBe("refused");
    if (rec.status === "refused") {
      expect(rec.code).toBe("already_matched_to_bill");
      expect(rec.details?.bank_transaction_id).toBe("bank-1");
      expect(rec.details?.matched_bill_id).toBe("bill-99");
    }
  });

  it("cross-entity → refusal account_cross_entity", async () => {
    const foreign = { ...bankBase, operating_company_id: OTHER };
    await expect(
      acceptRelayBankMatch(
        {
          query: vi.fn(async (sql: string) => {
            if (sql.includes("FROM banking.bank_transactions") && sql.includes("LIMIT 1")) {
              return { rows: [foreign] };
            }
            return { rows: [] };
          }),
        } as never,
        {
          operating_company_id: OPCO,
          bank_transaction_id: "bank-1",
          relay_fuel_transaction_id: "fill-1",
          actor_user_uuid: "actor",
        }
      )
    ).rejects.toMatchObject({ code: "account_cross_entity" });
  });

  it("re-match → prior link reversed via reversePostedSourceTransaction, never void", async () => {
    const prior = {
      ...bankBase,
      matched_relay_fuel_transaction_id: "fill-old",
      matched_journal_entry_id: "je-prior",
      review_state: "matched",
    };
    let bankLoads = 0;
    const { c, calls } = makeClient([
      (q) => {
        if (q.sql.includes("matched_relay_fuel_transaction_id = $1")) return { rows: [] };
        if (q.sql.includes("FROM banking.bank_transactions") && q.sql.includes("LIMIT 1") && !q.sql.includes("UPDATE")) {
          bankLoads += 1;
          if (bankLoads === 1) return { rows: [prior] };
          return {
            rows: [
              {
                ...bankBase,
                matched_relay_fuel_transaction_id: null,
                matched_journal_entry_id: null,
                review_state: "for_review",
              },
            ],
          };
        }
        return null;
      },
      (q) => {
        if (q.sql.includes("FROM accounting.journal_entries")) {
          return {
            rows: [{ source_transaction_type: "bank_categorization", source_transaction_id: "bank-1" }],
          };
        }
        return null;
      },
      (q) => {
        if (q.sql.includes("UPDATE banking.bank_transactions") && q.sql.includes("for_review")) {
          return { rows: [], rowCount: 1 };
        }
        return null;
      },
      (q) => {
        if (q.sql.includes("FROM integrations.relay_fuel_transactions r") && q.sql.includes("r.id = $1")) {
          return { rows: [fillBase] };
        }
        return null;
      },
      (q) => {
        if (q.sql.includes("UPDATE banking.bank_transactions") && q.sql.includes("matched")) {
          return { rows: [], rowCount: 1 };
        }
        return null;
      },
      (q) => {
        if (q.sql.includes("INSERT INTO banking.reconciliation_matches")) return { rows: [], rowCount: 1 };
        return null;
      },
    ]);

    await rematchRelayBankMatch(c as never, {
      operating_company_id: OPCO,
      bank_transaction_id: "bank-1",
      relay_fuel_transaction_id: "fill-1",
      actor_user_uuid: "actor",
    });
    expect(mockReverse).toHaveBeenCalledTimes(1);
    expect(mockReverse.mock.calls[0]![1]).toMatchObject({
      source_transaction_type: "bank_categorization",
      source_transaction_id: "bank-1",
    });
    expect(JSON.stringify(calls)).not.toMatch(/voidDocument|void_at|postVoid/i);
  });

  it("$0 → refusal zero_amount", async () => {
    const zero = { ...bankBase, amount_cents: 0 };
    const { c } = makeClient([
      (q) => {
        if (q.sql.includes("FROM banking.bank_transactions") && q.sql.includes("LIMIT 1")) {
          return { rows: [zero] };
        }
        return null;
      },
    ]);
    const rec = await recommendRelayBankMatch(c as never, {
      operating_company_id: OPCO,
      bank_transaction_id: "bank-1",
    });
    expect(rec).toMatchObject({ status: "refused", code: "zero_amount" });
  });

  it("a fill dated before 2026-08-03 → refused, never matched", async () => {
    const old = { ...fillBase, fill_date: "2026-08-02" };
    const { c } = makeClient([
      (q) => {
        if (q.sql.includes("FROM integrations.relay_fuel_transactions r") && q.sql.includes("r.id = $1")) {
          return { rows: [old] };
        }
        return null;
      },
    ]);
    const rec = await recommendRelayBankMatch(c as never, {
      operating_company_id: OPCO,
      relay_fuel_transaction_id: "fill-1",
    });
    expect(rec).toMatchObject({ status: "refused", code: "pre_floor_fill" });

    await expect(
      acceptRelayBankMatch(
        {
          query: vi.fn(async (sql: string) => {
            if (sql.includes("FROM banking.bank_transactions")) return { rows: [bankBase] };
            if (sql.includes("FROM integrations.relay_fuel_transactions")) return { rows: [old] };
            return { rows: [] };
          }),
        } as never,
        {
          operating_company_id: OPCO,
          bank_transaction_id: "bank-1",
          relay_fuel_transaction_id: "fill-1",
          actor_user_uuid: "actor",
        }
      )
    ).rejects.toBeInstanceOf(RelayBankMatchRefusal);
  });

  it("matching does NOT create, touch or require an expense", async () => {
    const { c, calls } = makeClient([
      (q) => {
        if (q.sql.includes("matched_relay_fuel_transaction_id = $1")) return { rows: [] };
        if (q.sql.includes("FROM banking.bank_transactions") && q.sql.includes("LIMIT 1")) {
          return { rows: [bankBase] };
        }
        return null;
      },
      (q) => {
        if (q.sql.includes("FROM integrations.relay_fuel_transactions r") && q.sql.includes("r.id = $1")) {
          return { rows: [fillBase] };
        }
        return null;
      },
      (q) => {
        if (q.sql.includes("UPDATE banking.bank_transactions")) return { rows: [], rowCount: 1 };
        return null;
      },
      (q) => {
        if (q.sql.includes("INSERT INTO banking.reconciliation_matches")) return { rows: [], rowCount: 1 };
        return null;
      },
    ]);
    const out = await acceptRelayBankMatch(c as never, {
      operating_company_id: OPCO,
      bank_transaction_id: "bank-1",
      relay_fuel_transaction_id: "fill-1",
      actor_user_uuid: "actor",
    });
    expect(out.expense_created).toBe(false);
    expect(out.journal_entry_created).toBe(false);
    expect(calls.some((x) => /accounting\.expenses|postFuel|postSourceTransaction/.test(x.sql))).toBe(false);
  });

  it("scanCategorizedLinesForAlreadyMatchedToBill reports every line id", async () => {
    const { c } = makeClient([
      () => ({
        rows: [
          { bank_transaction_id: "b-a", matched_bill_id: "bill-1" },
          { bank_transaction_id: "b-b", matched_bill_id: "bill-2" },
        ],
      }),
    ]);
    const hits = await scanCategorizedLinesForAlreadyMatchedToBill(c as never, OPCO);
    expect(hits).toEqual([
      { bank_transaction_id: "b-a", matched_bill_id: "bill-1" },
      { bank_transaction_id: "b-b", matched_bill_id: "bill-2" },
    ]);
  });
});
