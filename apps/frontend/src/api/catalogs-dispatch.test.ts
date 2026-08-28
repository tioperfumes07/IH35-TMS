import { describe, expect, it, vi } from "vitest";
import { listAllDispatchCatalogRows, type DispatchCatalogRow } from "./catalogs-dispatch";

const row = (id: string): DispatchCatalogRow => ({
  id,
  operating_company_id: "00000000-0000-4000-8000-000000000001",
  code: `CODE_${id}`,
  display_name: `Row ${id}`,
  description: null,
  metadata: {},
  is_active: true,
  sort_order: 100,
  created_at: "2026-08-28T00:00:00.000Z",
  updated_at: "2026-08-28T00:00:00.000Z",
});

describe("listAllDispatchCatalogRows", () => {
  it("exhausts stable pages using returned page length", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ rows: [row("1"), row("2")], total: 3 })
      .mockResolvedValueOnce({ rows: [row("3")], total: 3 });

    const result = await listAllDispatchCatalogRows({ list }, {
      operating_company_id: "00000000-0000-4000-8000-000000000001",
      is_active: "true",
    }, 2);

    expect(result.rows.map((item) => item.id)).toEqual(["1", "2", "3"]);
    expect(list.mock.calls.map(([filters]) => filters.offset)).toEqual([0, 2]);
  });

  it("rejects total drift", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ rows: [row("1")], total: 2 })
      .mockResolvedValueOnce({ rows: [row("2")], total: 3 });
    await expect(listAllDispatchCatalogRows({ list }, { operating_company_id: row("x").operating_company_id }, 1))
      .rejects.toThrow("changed while loading");
  });

  it("rejects duplicate and zero-progress pages", async () => {
    const duplicate = vi
      .fn()
      .mockResolvedValueOnce({ rows: [row("1")], total: 2 })
      .mockResolvedValueOnce({ rows: [row("1")], total: 2 });
    await expect(listAllDispatchCatalogRows({ list: duplicate }, { operating_company_id: row("x").operating_company_id }, 1))
      .rejects.toThrow("duplicate row");

    const stopped = vi
      .fn()
      .mockResolvedValueOnce({ rows: [row("1")], total: 2 })
      .mockResolvedValueOnce({ rows: [], total: 2 });
    await expect(listAllDispatchCatalogRows({ list: stopped }, { operating_company_id: row("x").operating_company_id }, 1))
      .rejects.toThrow("stopped before the reported total");
  });
});
