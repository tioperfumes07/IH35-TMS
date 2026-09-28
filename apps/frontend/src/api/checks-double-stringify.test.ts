import * as client from "./client";
import { createCheck } from "./checks";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression: money-path api clients must pass a RAW OBJECT body to apiRequest (apiRequest does the
// single JSON.stringify). A pre-stringified body double-encodes and the server rejects with 400
// "expected object, received string" -- the exact bug PR 1/7 of this round found and fixed in
// banking.ts's acceptBankReconMatchSet. checks.ts is new; proving it right from the start.
describe("checks api client sends a raw object body (double-stringify regression)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("createCheck POSTs a raw object body", async () => {
    const spy = vi.spyOn(client, "apiRequest").mockResolvedValue({ id: "c-1" } as never);
    const input = {
      operating_company_id: "co-1",
      bank_account_id: "ba-1",
      payee_kind: "vendor" as const,
      payee_id: "v-1",
      check_date: "2026-09-25",
      print_later: false,
      check_number: "1001",
      lines: [{ line_kind: "category" as const, category_kind: "maintenance", category_code: "maintenance", amount_cents: 500 }],
    };
    await createCheck(input);
    const [path, options] = spy.mock.calls[0];
    expect(path).toBe("/api/v1/checks");
    expect(options?.method).toBe("POST");
    expect(typeof options?.body).toBe("object");
    expect(options?.body).toEqual(input);
  });
});
