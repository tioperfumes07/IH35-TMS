import { describe, expect, it, vi } from "vitest";
import { applyPayment } from "../apply.service.js";

const { mockNextCreditMemoDisplayId, mockPostSourceTransaction } = vi.hoisted(() => ({
  mockNextCreditMemoDisplayId: vi.fn(async () => "CM-2026-0009"),
  mockPostSourceTransaction: vi.fn(async () => ({ result: "already_posted" })),
}));

vi.mock("../../display-id.js", () => ({
  nextCreditMemoDisplayId: mockNextCreditMemoDisplayId,
}));

vi.mock("../../posting-engine.service.js", () => ({
  postSourceTransaction: mockPostSourceTransaction,
  // ACCT-F165 — apply.service now posts via the IN-CLIENT-TX poster so the A/R receipt lands on the
  // CALLER'S transaction (the pool variant opened a second connection where the caller's uncommitted
  // payment + applications were invisible, so the receipt silently posted nothing). Both exports are
  // mocked to the SAME spy: these tests assert THAT a post happened and with what payload, which is
  // unchanged, and pointing them at one spy keeps the existing assertions meaningful either way.
  postSourceTransactionInClientTx: mockPostSourceTransaction,
}));

// CUSTOMER_PAYMENT_GL_POSTING_ENABLED kill switch — enable it so this test exercises the post path.
// (The default-OFF no-op behavior is proved in accounting/__tests__/posting-kill-switch-gated.test.ts.)
vi.mock("../../../lib/feature-flags/service.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, isEnabled: async () => true };
});

describe("applyPayment overpayment handling", () => {
  it("creates AR credit memo when unapplied amount remains", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounting.payments")) {
        return {
          rows: [
            {
              id: "payment-1",
              customer_id: "11111111-1111-4111-8111-111111111111",
              payment_date: "2026-05-23",
              amount_unapplied_cents: 10000,
              voided_at: null,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.payment_applications")) return { rows: [] };
      if (sql.includes("FROM accounting.invoices")) {
        return {
          rows: [
            {
              id: "inv-1",
              customer_id: "11111111-1111-4111-8111-111111111111",
              status: "sent",
              amount_open_cents: 6000,
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO accounting.payment_applications")) return { rows: [{ id: "app-1" }] };
      if (sql.includes("SELECT amount_unapplied_cents::bigint")) return { rows: [{ amount_unapplied_cents: 4000 }] };
      if (sql.includes("INSERT INTO accounting.credit_memos")) return { rows: [] };
      return { rows: [] };
    });

    const applied = await applyPayment(
      { query },
      {
        operating_company_id: "00000000-0000-4000-8000-000000000001",
        payment_id: "00000000-0000-4000-8000-000000000099",
        applications: [
          {
            target_kind: "invoice",
            target_id: "00000000-0000-4000-8000-000000000055",
            amount_cents: 6000,
          },
        ],
      },
      { user_id: "00000000-0000-4000-8000-000000000042" }
    );

    expect(applied.overpayment_credit_memo_display_id).toBe("CM-2026-0009");
    expect(mockNextCreditMemoDisplayId).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO accounting.credit_memos"))).toBe(true);
  });
});

// ACCT-F5633 — amount_open_cents (a GENERATED column) has no knowledge of non-voided credit-memo
// applications. A cash payment must not be allowed to apply on top of a balance a credit memo already
// covered, the same class of bug credit-memos.routes.ts's own apply route and ar-aging.service.ts
// (ACCT-F5612) already close for their own paths.
describe("applyPayment nets non-voided credit-memo applications off the invoice cap", () => {
  it("refuses a cash application that would overshoot the TRUE remaining balance (open minus applied credit memo)", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounting.payments")) {
        return {
          rows: [
            {
              id: "payment-2",
              customer_id: "11111111-1111-4111-8111-111111111111",
              payment_date: "2026-05-23",
              amount_unapplied_cents: 100000,
              voided_at: null,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.invoices")) {
        // amount_open_cents (the GENERATED column) still reads the full $1,000 -- it never saw the
        // credit memo below. A naive cap check against this alone would let 100000 cents through.
        return {
          rows: [
            {
              id: "inv-2",
              customer_id: "11111111-1111-4111-8111-111111111111",
              status: "sent",
              amount_open_cents: 100000,
            },
          ],
        };
      }
      // A $600 non-voided credit memo already applied to this invoice -- true remaining is $400.
      if (sql.includes("FROM accounting.credit_memo_applications")) {
        return { rows: [{ applied_cents: "60000" }] };
      }
      return { rows: [] };
    });

    await expect(
      applyPayment(
        { query },
        {
          operating_company_id: "00000000-0000-4000-8000-000000000001",
          payment_id: "00000000-0000-4000-8000-000000000099",
          applications: [
            {
              target_kind: "invoice",
              // 500.00 -- exceeds the TRUE remaining ($1,000 - $600 = $400), even though it's well
              // under the GENERATED column's stale $1,000 open balance.
              target_id: "00000000-0000-4000-8000-000000000056",
              amount_cents: 50000,
            },
          ],
        },
        { user_id: "00000000-0000-4000-8000-000000000042" }
      )
    ).rejects.toMatchObject({ code: "amount_exceeds_invoice_open" });

    expect(query.mock.calls.some(([sql]) => String(sql).includes("FROM accounting.credit_memo_applications"))).toBe(
      true
    );
  });

  it("allows a cash application within the TRUE remaining balance", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounting.payments")) {
        return {
          rows: [
            {
              id: "payment-3",
              customer_id: "11111111-1111-4111-8111-111111111111",
              payment_date: "2026-05-23",
              amount_unapplied_cents: 100000,
              voided_at: null,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.invoices")) {
        return {
          rows: [
            {
              id: "inv-3",
              customer_id: "11111111-1111-4111-8111-111111111111",
              status: "sent",
              amount_open_cents: 100000,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.credit_memo_applications")) {
        return { rows: [{ applied_cents: "60000" }] };
      }
      if (sql.includes("INSERT INTO accounting.payment_applications")) return { rows: [{ id: "app-2" }] };
      if (sql.includes("SELECT amount_unapplied_cents::bigint")) return { rows: [{ amount_unapplied_cents: 6000 }] };
      return { rows: [] };
    });

    // 400.00 -- exactly the true remaining balance ($1,000 - $600). Must succeed.
    await expect(
      applyPayment(
        { query },
        {
          operating_company_id: "00000000-0000-4000-8000-000000000001",
          payment_id: "00000000-0000-4000-8000-000000000099",
          applications: [{ target_kind: "invoice", target_id: "00000000-0000-4000-8000-000000000057", amount_cents: 40000 }],
        },
        { user_id: "00000000-0000-4000-8000-000000000042" }
      )
    ).resolves.toBeDefined();
  });
});
