import { describe, expect, it, vi } from "vitest";
import { resolveMdataAssetId, RESOLVE_MDATA_ASSET_ID_SQL } from "../resolve-asset-id.shared.js";

describe("resolveMdataAssetId", () => {
  it("returns the resolved asset id when the bridge query finds a row", async () => {
    const query = vi.fn(async () => ({ rows: [{ id: "asset-uuid" }] }));
    const result = await resolveMdataAssetId({ query }, "company-uuid", "unit-uuid");
    expect(result).toBe("asset-uuid");
    expect(query).toHaveBeenCalledWith(RESOLVE_MDATA_ASSET_ID_SQL, ["company-uuid", "unit-uuid"]);
  });

  it("returns null when no asset matches", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const result = await resolveMdataAssetId({ query }, "company-uuid", "missing-uuid");
    expect(result).toBeNull();
  });
});
