import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { PoolClient } from "pg";
import { exportListWorkbook } from "./desk.service.js";

function fakeClient(): PoolClient {
  return {
    query: async (sql: string) => {
      if (/FROM perfume\.price_lists l JOIN perfume\.vendors/.test(sql)) return { rows: [{ vendor: "La Esperanza Fragrances", created_at: "2026-11-14" }] };
      if (/FROM perfume\.brand_aliases/.test(sql)) return { rows: [] };
      if (/SELECT brand, name FROM perfume\.items/.test(sql)) return { rows: [] };
      if (/FROM perfume\.price_list_rows r/.test(sql)) return { rows: [
        { sheet: null, row_no: 1, description: "HALLOWEEN BLOSSOM W 3.4oz EDT", brand: null, upc: "008411117777", sku: null, size_text: null, price_cents: 1650,
          match_status: "matched", gender_override: null, item_id: "i1", display_name: "JESUS DEL POZO · HALLOWEEN BLOSSOM · 100 ml", item_brand: "JESUS DEL POZO", other_vendors: 3, low_other_cents: 1800 },
        { sheet: null, row_no: 2, description: "SHI W 3.4 EDP", brand: null, upc: null, sku: null, size_text: null, price_cents: 900,
          match_status: "unmatched", gender_override: null, item_id: null, display_name: null, item_brand: null, other_vendors: 0, low_other_cents: null },
      ] };
      throw new Error(`unexpected sql ${sql}`);
    },
  } as unknown as PoolClient;
}

describe("vendor list export with BRAND (owner 11-14)", () => {
  it("description as written, brand read, UPC as text, live check formulas", async () => {
    const out = await exportListWorkbook(fakeClient(), "00000000-0000-0000-0000-000000000000");
    expect(out?.fileName).toMatch(/^La-Esperanza-Fragrances-LIST-WITH-BRAND-/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out!.buf);
    const ws = wb.getWorksheet("List with brand")!;
    expect(ws.getRow(2).getCell(2).value).toBe("DESCRIPTION");
    expect(ws.getRow(3).getCell(2).value).toBe("HALLOWEEN BLOSSOM W 3.4oz EDT");
    expect(ws.getRow(3).getCell(3).value).toBe("008411117777");
    expect(ws.getRow(3).getCell(6).value).toBe("JESUS DEL POZO");
    expect((ws.getRow(3).getCell(10).value as { formula: string }).formula).toBe('IF(I3="","",IF(UPPER(TRIM(F3))=UPPER(TRIM(I3)),"YES","NO"))');
    expect((ws.getRow(3).getCell(10).value as { result: string }).result).toBe("YES");
    expect((ws.getRow(3).getCell(13).value as { result: string }).result).toBe("YES");
    expect(ws.getRow(4).getCell(7).value).toBe("unmatched");
    expect(wb.getWorksheet("Summary")!.getRow(3).getCell(2).value).toMatchObject({ formula: expect.stringContaining('"linked"') });
  });
});
