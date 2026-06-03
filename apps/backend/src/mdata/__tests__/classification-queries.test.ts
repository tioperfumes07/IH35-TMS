import { describe, expect, it, vi } from "vitest";
import {
  listActiveCustomerClassifications,
  listActiveVendorClassifications,
} from "../classification-queries.js";

describe("classification listing queries", () => {
  it("excludes archived customer classification rows", async () => {
    const query = vi.fn(async (sql: string) => {
      expect(sql).toContain("archived_at IS NULL");
      expect(sql).toContain("accounting.customer_classifications");
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000000010",
            tag_key: "preferred",
            tag_label: "Preferred",
            applied_at: "2026-06-01T00:00:00.000Z",
            applied_by_user_id: "00000000-0000-4000-8000-000000000099",
          },
        ],
      };
    });

    const rows = await listActiveCustomerClassifications(
      { query },
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002"
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.tag_label).toBe("Preferred");
  });

  it("excludes archived vendor classification rows", async () => {
    const query = vi.fn(async (sql: string) => {
      expect(sql).toContain("archived_at IS NULL");
      expect(sql).toContain("accounting.vendor_classifications");
      return { rows: [] };
    });

    const rows = await listActiveVendorClassifications(
      { query },
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000002"
    );

    expect(rows).toEqual([]);
  });
});
