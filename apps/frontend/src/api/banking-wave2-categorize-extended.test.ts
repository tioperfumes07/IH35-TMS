import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client";
import { postBankTransactionCategorizeExtended } from "./banking-wave2";

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, apiRequest: vi.fn() };
});

import { apiRequest } from "./client";

describe("postBankTransactionCategorizeExtended", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("on 404 from categorize, falls back to accept endpoint", async () => {
    vi.mocked(apiRequest)
      .mockRejectedValueOnce(new ApiError(404, {}))
      .mockResolvedValueOnce({ ok: true });

    const res = await postBankTransactionCategorizeExtended("txn-1", "co-1", {
      account_id: "acc-1",
      vendor_id: "v-1",
      memo: "m",
    });

    expect(res).toEqual({ ok: true });
    expect(vi.mocked(apiRequest).mock.calls.length).toBe(2);
    expect(String(vi.mocked(apiRequest).mock.calls[0]?.[0])).toContain("/categorize");
    expect(String(vi.mocked(apiRequest).mock.calls[1]?.[0])).toContain("/accept");
  });
});
