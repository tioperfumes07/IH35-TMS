import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./client";
import { listOpenPreSettlements } from "./preSettlements";

vi.mock("./client", () => ({ apiRequest: vi.fn() }));
const request = vi.mocked(apiRequest);
const row = (id: string, status = "open", extra = {}) => ({ id, status, trip_closed_at: null, payment_state: "unpaid", ...extra });

describe("standalone Pre-Settlements population", () => {
  beforeEach(() => { request.mockReset(); });

  it("shows every open settlement, including the ninth, without closed, cancelled or paid records", async () => {
    const open = Array.from({ length: 10 }, (_, index) => row(`open-${index}`));
    const all = [...open, row("draft", "draft"), row("presettle", "presettle"), row("acked", "acked"), row("held", "held"),
      row("closed", "closed"), row("cancelled", "cancelled"), row("paid", "paid"),
      row("closed-stamp", "open", { trip_closed_at: "2026-09-10T12:00:00Z" }),
      row("paid-state", "open", { payment_state: "manual_paid" })];
    request.mockResolvedValue({ settlements: all, total_count: all.length });
    expect((await listOpenPreSettlements("company-a")).map(r => r.id)).toEqual([
      ...open.map(r => r.id), "draft", "presettle", "acked", "held",
    ]);
  });

  it("reads later API pages under the same company before deriving the open register", async () => {
    const first = Array.from({ length: 200 }, (_, index) => row(`closed-${index}`, "closed"));
    request.mockResolvedValueOnce({ settlements: first, total_count: 201 })
      .mockResolvedValueOnce({ settlements: [row("last-open")], total_count: 201 });
    expect((await listOpenPreSettlements("company-a")).map(r => r.id)).toEqual(["last-open"]);
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/v1/driver-finance/settlements?operating_company_id=company-a&limit=200&offset=0",
      "/api/v1/driver-finance/settlements?operating_company_id=company-a&limit=200&offset=200",
    ]);
  });

  it("rejects a missing later page rather than rendering a partial zero result", async () => {
    request.mockResolvedValue({ settlements: [], total_count: 1 });
    await expect(listOpenPreSettlements("company-a")).rejects.toThrow("incomplete");
  });

  it("propagates API failures instead of reporting no open settlements", async () => {
    request.mockRejectedValue(new Error("Service unavailable"));
    await expect(listOpenPreSettlements("company-a")).rejects.toThrow("Service unavailable");
  });
});
