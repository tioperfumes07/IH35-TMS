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
});
