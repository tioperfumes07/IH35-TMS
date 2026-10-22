// LEAD 443.217 (catalog Excel import, excel-uploader.ts:89-103) — an is_active cell typed "FALSE" / "No" / "0" was imported
// as ACTIVE and an empty cell as INACTIVE (z.coerce.boolean = JS Boolean(value)). Fails on main, passes with cellBoolean.
import { describe, expect, it } from "vitest";
import { validateImportRow } from "../excel-uploader.js";
import { fleetEquipmentTypesCatalogConfig } from "../generic-catalog.routes.js";

function importedActive(cell: unknown): unknown {
  const r = validateImportRow({ code: "VAN", display_name: "Dry van", is_active: cell }, fleetEquipmentTypesCatalogConfig);
  return r.ok ? r.data.is_active : `error: ${r.message}`;
}

describe("catalog Excel import — the is_active cell", () => {
  it.each(["FALSE", "false", "No", "no", "N", "0", 0, false])("%s imports as INACTIVE", (cell) => {
    expect(importedActive(cell)).toBe(false);
  });
  it.each(["TRUE", "Yes", "Y", "1", 1, true])("%s imports as ACTIVE", (cell) => {
    expect(importedActive(cell)).toBe(true);
  });
  it("an empty cell is 'not given' — the catalog default (active), never inactive", () => {
    expect(importedActive("")).toBe(true);
    expect(importedActive("   ")).toBe(true);
  });
  it("an unrecognised word is a row error, never guessed", () => {
    expect(String(importedActive("maybe"))).toMatch(/^error: is_active/);
  });
});
