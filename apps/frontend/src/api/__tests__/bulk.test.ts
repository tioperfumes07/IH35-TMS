import { describe, expect, it, vi } from "vitest";
import * as clientApi from "../client";
import { bulkUpdate, BulkUpdateCapError, BULK_UPDATE_MAX_IDS } from "../bulk";

describe("bulkUpdate API helper", () => {
  it("throws BulkUpdateCapError when ids exceed cap", async () => {
    const ids = Array.from({ length: BULK_UPDATE_MAX_IDS + 1 }, (_, i) => `id-${i}`);
    await expect(
      bulkUpdate({ domain: "mdata", resource: "customers", ids, action: "set_status" })
    ).rejects.toBeInstanceOf(BulkUpdateCapError);
  });

  it("posts to canonical bulk-update path", async () => {
    const spy = vi.spyOn(clientApi, "apiRequest").mockResolvedValue({
      requested: 2,
      succeeded: ["a", "b"],
      failed: [],
      audit_log_ids: [],
      bulk_call_id: "bulk-1",
    });
    const res = await bulkUpdate({
      domain: "mdata",
      resource: "customers",
      ids: ["a", "b"],
      action: "set_status",
      payload: { status: "inactive" },
      reason: "Cleanup inactive accounts",
      operatingCompanyId: "oc-1",
    });
    expect(spy).toHaveBeenCalledWith(
      "/api/v1/mdata/customers/bulk-update?operating_company_id=oc-1",
      expect.objectContaining({ method: "POST" })
    );
    expect(res.succeeded).toEqual(["a", "b"]);
    expect(res.bulk_call_id).toBe("bulk-1");
  });

  it("never fabricates success when the backend reports an item failure", async () => {
    vi.spyOn(clientApi, "apiRequest").mockResolvedValue({
      requested: 1,
      succeeded: [],
      failed: [{ id: "customer-1", code: "E_UPDATE_FAILED", message: "Customer update failed" }],
      audit_log_ids: [],
      bulk_call_id: "bulk-failed",
    });

    const res = await bulkUpdate({
      domain: "mdata",
      resource: "customers",
      ids: ["customer-1"],
      action: "classify",
      payload: { classification: "preferred" },
      operatingCompanyId: "oc-1",
    });

    expect(res.succeeded).toEqual([]);
    expect(res.failed).toEqual([
      { id: "customer-1", code: "E_UPDATE_FAILED", message: "Customer update failed" },
    ]);
  });

  it("preserves legacy affected_ids compatibility without guessing selected ids", async () => {
    vi.spyOn(clientApi, "apiRequest").mockResolvedValue({
      requested: 1,
      affected_ids: ["customer-1"],
      failed: [],
      audit_log_ids: [],
      bulk_call_id: "bulk-legacy",
    });

    const res = await bulkUpdate({
      domain: "mdata",
      resource: "customers",
      ids: ["customer-1"],
      action: "classify",
      payload: { classification: "preferred" },
      operatingCompanyId: "oc-1",
    });

    expect(res.succeeded).toEqual(["customer-1"]);
    expect(res.failed).toEqual([]);
  });
});
