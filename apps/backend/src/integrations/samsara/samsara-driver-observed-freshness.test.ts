import { describe, expect, it, vi } from "vitest";
import { touchObservedSamsaraDriver } from "./samsara-positions.service.js";

describe("touchObservedSamsaraDriver", () => {
  it("upserts the observed driver under the ingestion company and advances freshness monotonically", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await touchObservedSamsaraDriver(
      { query } as never,
      "5c854333-6ea5-4faa-af31-67cb272fef80",
      "samsara-driver-7",
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "2026-09-05T15:45:00.000Z"
    );

    const [sql, values] = query.mock.calls[0] ?? [];
    expect(sql).toContain("INSERT INTO integrations.samsara_drivers");
    expect(sql).toContain("ON CONFLICT (operating_company_id, samsara_driver_id) DO UPDATE");
    expect(sql).toContain("GREATEST(");
    expect(sql).toContain("EXCLUDED.last_seen_at");
    expect(values).toEqual([
      "5c854333-6ea5-4faa-af31-67cb272fef80",
      "samsara-driver-7",
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "2026-09-05T15:45:00.000Z",
    ]);
  });
});
