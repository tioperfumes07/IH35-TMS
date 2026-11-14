import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { analysisRowsOf, exportFormulas, exportWorkbook, prepare, DEFAULT_RULES, type GridCol, type GridRow } from "./desk.service";

// Owner 2026-11-14: "my lists there are 583 rows - 1 header, so 582 items. why does the list in list analysis only have 463";
// "a box to select if i want to view their list or just my list … a little filter … only those items that are matched";
// "all are supposed to be able to be exported to excel, with formulas automatically".
describe("List analysis — one row per LINE, my list | their list, all | matched | not matched", () => {
  const g = {
    myLines: [{ id: "m:1", matched: 1 }, { id: "m:2", matched: 0 }, { id: "m:3", matched: 0 }] as GridRow[],
    theirLines: [{ id: "c:1", matched: 1 }, { id: "c:2", matched: 0 }] as GridRow[],
  };
  it("my list = every line of mine; their list = every competitor line", () => {
    expect(analysisRowsOf(g, "mine", "all").map((r) => r.id)).toEqual(["m:1", "m:2", "m:3"]);
    expect(analysisRowsOf(g, "theirs", "all").map((r) => r.id)).toEqual(["c:1", "c:2"]);
  });
  it("matched (in common) and not matched split the lines with nothing lost", () => {
    expect(analysisRowsOf(g, "mine", "matched").map((r) => r.id)).toEqual(["m:1"]);
    expect(analysisRowsOf(g, "mine", "unmatched").map((r) => r.id)).toEqual(["m:2", "m:3"]);
    expect(analysisRowsOf(g, "theirs", "unmatched").map((r) => r.id)).toEqual(["c:2"]);
  });
});

describe("My own list keeps a line with no price; a supplier's list never does", () => {
  const body = { vendor_id: "v", rows: [{ description: "JC PEACE LOVE", price: null, qty: 11 }, { description: "TOUS NEON CANDY", price: "", qty: 600 }, { description: "CIELO BLUE", price: "4.50", qty: 3 }] } as never;
  it("own list (offer / inventory): all 3 lines, the priceless ones with no price and no made-up $0", () => {
    const { saved, total } = prepare(body, true);
    expect(saved.map((r) => [r.description, r.price_cents])).toEqual([["JC PEACE LOVE", null], ["TOUS NEON CANDY", null], ["CIELO BLUE", 450]]);
    expect(total).toBe(450);
  });
  it("supplier / competitor list: a line with no price is not a price, so it is skipped", () => {
    expect(prepare(body, false).saved.map((r) => r.description)).toEqual(["CIELO BLUE"]);
  });
});

describe("Excel export — every computed column is a live formula", () => {
  const A = (k: string, kind: GridCol["kind"]): GridCol => ({ key: k, label: k, group: "a", kind });
  const cols: GridCol[] = [A("a:name", "text"), A("a:last_cost", "money"), A("a:offer", "money"), A("a:c_list", "money"), A("a:c_cushion", "money"), A("a:c_sales", "money"),
    A("a:esp", "money"), A("a:margin", "pct"), A("a:markup", "pct"), A("a:low_sales", "money"), A("a:min_margin", "pct"), A("a:min_buy", "money"),
    A("a:under_by", "money"), A("a:under_pct", "pct"), A("a:can_inc", "pct"), A("a:over_by", "money"), A("a:lower_pct", "pct"), A("a:new_margin", "pct"), A("a:cand", "text")];
  // His sheet: cost 14, offer 20; Esperanza 20.50 − .50 = 20.00.
  const row: GridRow = { id: "m:1", "a:name": "CIELO", "a:last_cost": 1400, "a:offer": 2000, "a:c_list": 2050, "a:c_cushion": 50, "a:c_sales": 2000, "a:esp": 2000,
    "a:margin": 30, "a:markup": 42.9, "a:low_sales": 2000, "a:min_margin": 20, "a:min_buy": 1600, "a:under_by": 0, "a:under_pct": 0, "a:can_inc": 0, "a:over_by": 0, "a:lower_pct": 0, "a:new_margin": 30,
    "a:cand": [{ label: "CIELO BLUE 3.3 · LA ESPERANZA" }, { label: "CIELO 3.4 · LA ESPERANZA" }] as unknown as string };
  it("writes the owner's formulas against the exported cells", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await exportWorkbook(cols, [row], DEFAULT_RULES, "TIO analysis"));
    const ws = wb.worksheets[0]!;
    const at = (k: string) => ws.getRow(2).getCell(cols.findIndex((c) => c.key === k) + 1).value as { formula?: string; result?: unknown } | string;
    expect(at("a:c_sales")).toMatchObject({ formula: "D2-E2", result: 20 });
    expect(at("a:margin")).toMatchObject({ formula: 'IF(C2=0,"",(C2-B2)/C2)', result: 0.3 });
    expect(at("a:markup")).toMatchObject({ formula: 'IF(B2=0,"",(C2-B2)/B2)' });
    expect(at("a:low_sales")).toMatchObject({ formula: "MIN(C2,G2)" });
    expect(at("a:min_buy")).toMatchObject({ formula: "G2*(1-K2)", result: 16 });
    expect(at("a:under_by")).toMatchObject({ formula: "MAX(G2-C2,0)" });
    expect(at("a:over_by")).toMatchObject({ formula: "MAX(C2-G2,0)" });
    expect(at("a:new_margin")).toMatchObject({ formula: 'IF(G2=0,"",(G2-B2)/G2)' });
    // The match candidates are text in Excel, never an object.
    expect(at("a:cand")).toBe("CIELO BLUE 3.3 · LA ESPERANZA; CIELO 3.4 · LA ESPERANZA");
  });
  it("wholesale and competition formulas only when their input columns are exported too", () => {
    const w = (k: string, kind: GridCol["kind"] = "money"): GridCol => ({ key: k, label: k, group: "s", kind });
    const full = exportFormulas([w("my_offer_price"), w("s:v1:price"), w("s:v1:cushion"), w("s:v1:real"), w("s:v1:diff"), w("s:v1:diff_pct", "pct"), w("comp_low_list"), w("comp_cushion"), w("comp_cost"), w("c:v1:price"), w("c:v1:earn"), w("c:v1:margin", "pct")]);
    expect(full.map((f) => f.target).sort()).toEqual(["c:v1:earn", "c:v1:margin", "comp_cost", "s:v1:diff", "s:v1:diff_pct", "s:v1:real"]);
    expect(exportFormulas([w("s:v1:price"), w("s:v1:real")]).map((f) => f.target)).toEqual([]);
  });
});
