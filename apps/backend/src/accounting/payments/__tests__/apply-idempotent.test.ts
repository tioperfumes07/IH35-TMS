import { describe, expect, it, vi } from "vitest";
import { applyPayment } from "../apply.service.js";

const { mockNextCreditMemoDisplayId, mockPostSourceTransaction } = vi.hoisted(() => ({
  mockNextCreditMemoDisplayId: vi.fn(),
  mockPostSourceTransaction: vi.fn(async () => ({ result: "already_posted" })),
}));

vi.mock("../../display-id.js", () => ({
  nextCreditMemoDisplayId: mockNextCreditMemoDisplayId,
}));

vi.mock("../../posting-engine.service.js", () => ({
  postSourceTransaction: mockPostSourceTransaction,
}));

describe("applyPayment idempotency", () => {
  it("treats duplicate target amount as no-op", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounting.payments")) {
        return {
          rows: [
            {
              id: "payment-1",
              customer_id: "11111111-1111-4111-8111-111111111111",
              payment_date: "2026-05-23",
              amount_unapplied_cents: 5000,
              voided_at: null,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.payment_applications")) {
        return { rows: [{ id: "app-existing", amount_cents: 5000 }] };
      }
      if (sql.includes("SELECT amount_unapplied_cents::bigint")) {
        return { rows: [{ amount_unapplied_cents: 5000 }] };
      }
      return { rows: [] };
    });

    const result = await applyPayment(
      { query },
      {
        operating_company_id: "00000000-0000-4000-8000-000000000001",
        payment_id: "00000000-0000-4000-8000-000000000099",
        applications: [
          {
            target_kind: "invoice",
            target_id: "00000000-0000-4000-8000-000000000055",
            amount_cents: 5000,
          },
        ],
      },
      { user_id: "00000000-0000-4000-8000-000000000042" }
    );

    expect(result.application_ids).toEqual(["app-existing"]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO accounting.payment_applications"))).toBe(false);
  });
});
