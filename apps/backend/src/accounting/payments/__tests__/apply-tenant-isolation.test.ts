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

describe("applyPayment tenant isolation", () => {
  it("sets app.operating_company_id and filters targets by company", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounting.payments")) {
        return {
          rows: [
            {
              id: "payment-1",
              customer_id: "11111111-1111-4111-8111-111111111111",
              payment_date: "2026-05-23",
              amount_unapplied_cents: 20000,
              voided_at: null,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.payment_applications")) {
        return { rows: [] };
      }
      if (sql.includes("FROM accounting.invoices")) {
        return {
          rows: [
            {
              id: "inv-1",
              customer_id: "11111111-1111-4111-8111-111111111111",
              status: "sent",
              amount_open_cents: 20000,
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO accounting.payment_applications")) {
        return { rows: [{ id: "app-1" }] };
      }
      if (sql.includes("SELECT amount_unapplied_cents::bigint")) {
        return { rows: [{ amount_unapplied_cents: 0 }] };
      }
      return { rows: [] };
    });

    await applyPayment(
      { query },
      {
        operating_company_id: "00000000-0000-4000-8000-000000000001",
        payment_id: "00000000-0000-4000-8000-000000000099",
        applications: [
          {
            target_kind: "invoice",
            target_id: "00000000-0000-4000-8000-000000000055",
            amount_cents: 20000,
          },
        ],
      },
      { user_id: "00000000-0000-4000-8000-000000000042" }
    );

    const setConfigSql = String(query.mock.calls.find(([sql]) => String(sql).includes("set_config('app.operating_company_id'"))?.[0] ?? "");
    expect(setConfigSql).toContain("set_config('app.operating_company_id'");

    const paymentSql = String(query.mock.calls.find(([sql]) => String(sql).includes("FROM accounting.payments"))?.[0] ?? "");
    expect(paymentSql).toContain("operating_company_id = $2::uuid");

    const invoiceSql = String(query.mock.calls.find(([sql]) => String(sql).includes("FROM accounting.invoices"))?.[0] ?? "");
    expect(invoiceSql).toContain("operating_company_id = $2::uuid");
  });
});
