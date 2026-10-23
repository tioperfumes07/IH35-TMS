import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../api/client";
import { readFleetHealth } from "./fleet-health-source";

vi.mock("../../../api/client", () => ({ apiRequest: vi.fn() }));
describe("Maintenance V3 fleet health source", () => {
  beforeEach(() => { vi.mocked(apiRequest).mockReset(); });
  it("reads the scoped canonical endpoint and exhausts its total", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ kpi: { total: 2 }, units: [{ unit_id: "a" }] })
      .mockResolvedValueOnce({ kpi: { total: 2 }, units: [{ unit_id: "b" }] });
    expect((await readFleetHealth("company")).units).toHaveLength(2);
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/api/v1/maintenance/fleet-health?operating_company_id=company&limit=500&offset=0");
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/api/v1/maintenance/fleet-health?operating_company_id=company&limit=500&offset=1");
  });
  it("never substitutes an empty roster for an API error", async () => {
    const failure = new Error("read failed");
    vi.mocked(apiRequest).mockImplementation(() => { throw failure; });
    const result = await readFleetHealth("company").then(() => "unexpected success", (error: unknown) => error);
    expect(result).toBe(failure);
  });
  it("refuses a missing page instead of claiming complete coverage", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ kpi: { total: 2 }, units: [] });
    await expect(readFleetHealth("company")).rejects.toThrow("incomplete roster");
  });
  it("refuses duplicate rows and changing populations", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ kpi: { total: 2 }, units: [{ unit_id: "a" }] });
    await expect(readFleetHealth("company")).rejects.toThrow("repeated unit");
    vi.mocked(apiRequest).mockReset().mockResolvedValueOnce({ kpi: { total: 2 }, units: [{ unit_id: "a" }] })
      .mockResolvedValueOnce({ kpi: { total: 3 }, units: [{ unit_id: "b" }] });
    await expect(readFleetHealth("company")).rejects.toThrow("changed during pagination");
  });
});
