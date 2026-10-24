import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./client";
import { listTours } from "./tourReadout";

vi.mock("./client", () => ({ apiRequest: vi.fn() }));
const request = vi.mocked(apiRequest);
const tour = (id: string) => ({ settlement_id: id });
const base = "/api/v1/driver-finance/tours?operating_company_id=company-a&state=open&limit=200";

describe("listTours reads the whole population (443.284)", () => {
  beforeEach(() => { request.mockReset(); });

  it("returns the 201st open tour from the second page under the same company", async () => {
    const first = Array.from({ length: 200 }, (_, i) => tour(`t-${i}`));
    request.mockResolvedValueOnce({ state: "open", count: 201, voided_count: 3, rows: first })
      .mockResolvedValueOnce({ state: "open", count: 201, voided_count: 3, rows: [tour("t-200")] });
    const out = await listTours("company-a", "open");
    expect(out.rows).toHaveLength(201);
    expect(out.rows[200]?.settlement_id).toBe("t-200");
    expect(out.count).toBe(201);
    expect(out.voided_count).toBe(3);
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([`${base}&offset=0`, `${base}&offset=200`]);
  });

  it("asks once when the first page already holds every tour", async () => {
    request.mockResolvedValueOnce({ state: "open", count: 2, voided_count: 0, rows: [tour("a"), tour("b")] });
    expect((await listTours("company-a", "open")).rows.map((r) => r.settlement_id)).toEqual(["a", "b"]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("refuses a list that stops short of its count instead of showing a partial", async () => {
    request.mockResolvedValueOnce({ state: "open", count: 300, voided_count: 0, rows: Array.from({ length: 200 }, (_, i) => tour(`t-${i}`)) })
      .mockResolvedValueOnce({ state: "open", count: 300, voided_count: 0, rows: [] });
    await expect(listTours("company-a", "open")).rejects.toThrow("The tour list is incomplete");
  });
});
