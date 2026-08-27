import { describe, expect, it, vi } from "vitest";
import { ensureUnitAsset } from "./ensure-unit-asset.shared.js";

describe("ensureUnitAsset", () => {
  it("mints the entity-scoped insurance asset with the canonical unit FK idempotently", async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          unit_id: "22222222-2222-4222-8222-222222222222",
        },
      ],
    }));

    await ensureUnitAsset(
      { query },
      {
        tenantId: "11111111-1111-4111-8111-111111111111",
        unitId: "22222222-2222-4222-8222-222222222222",
        unitCode: "USMCA-101",
        vin: "1M8GDM9AXKP042788",
        make: "Freightliner",
        model: "Cascadia",
        year: 2025,
      },
    );

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain("INSERT INTO mdata.assets");
    expect(sql).toContain("ON CONFLICT (tenant_id, unit_code) DO UPDATE");
    expect(sql).toContain(
      "mdata.assets.unit_id IS NULL OR mdata.assets.unit_id = EXCLUDED.unit_id",
    );
    expect(sql).toContain("RETURNING id::text AS id, unit_id::text AS unit_id");
    expect(sql).toContain("unit_id");
    expect(values).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "USMCA-101",
      "1M8GDM9AXKP042788",
      "Freightliner",
      "Cascadia",
      2025,
      "22222222-2222-4222-8222-222222222222",
    ]);
  });
});
