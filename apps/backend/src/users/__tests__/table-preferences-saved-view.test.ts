/**
 * LEAD 443.181 — fail-old: on main the table-preferences PATCH accepted column_widths ONLY, so a
 * table's saved view (the retired ListView's `saved_view`) was rejected with 400 and never stored —
 * server-saved views could not follow the user to another device.
 */
import { describe, expect, it } from "vitest";
import { patchBodySchema } from "../table-preferences.routes.js";

describe("table-preferences PATCH body", () => {
  it("accepts a saved view on its own (column order / visibility / widths / page size / density)", () => {
    const r = patchBodySchema.safeParse({
      table_id: "listview:coa-list-v2",
      saved_view: { columnOrder: ["name", "number"], visibleColumns: { number: false }, columnWidths: { name: 240 }, pageSize: 50, density: "compact" },
    });
    expect(r.success).toBe(true);
  });

  it("still accepts column widths on their own", () => {
    expect(patchBodySchema.safeParse({ table_id: "t", column_widths: { a: 120 } }).success).toBe(true);
  });

  it("refuses an empty body and unknown saved-view keys", () => {
    expect(patchBodySchema.safeParse({ table_id: "t" }).success).toBe(false);
    expect(patchBodySchema.safeParse({ table_id: "t", saved_view: { sneaky: 1 } }).success).toBe(false);
    expect(patchBodySchema.safeParse({ table_id: "t", saved_view: { density: "huge" } }).success).toBe(false);
  });
});
