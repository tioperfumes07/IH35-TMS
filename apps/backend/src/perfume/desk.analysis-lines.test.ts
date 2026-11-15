import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { analysisFields, analysisRowsOf, exportColumnsWithInputs, exportFormulas, exportWorkbook, prepare, DEFAULT_RULES, type GridCol, type GridRow } from "./desk.service";

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
    const at = (k: string) => ws.getRow(3).getCell(cols.findIndex((c) => c.key === k) + 1).value as { formula?: string; result?: unknown } | string;
    expect(at("a:c_sales")).toMatchObject({ formula: "D3-E3", result: 20 });
    expect(at("a:margin")).toMatchObject({ formula: 'IF(C3=0,"",IF(B3="",0,(C3-B3)/C3))', result: 0.3 });
    expect(at("a:markup")).toMatchObject({ formula: 'IF(OR(B3="",B3=0),0,(C3-B3)/B3)' });
    expect(at("a:low_sales")).toMatchObject({ formula: "MIN(C3,G3)" });
    // Owner 19:03 CT: a min purchase price only where Esperanza is cheaper — a formula on every row, blank otherwise.
    expect(at("a:min_buy")).toMatchObject({ formula: 'IF(AND(G3<>"",C3<>"",G3<C3),G3*(1-K3),"")' });
    expect(at("a:under_by")).toMatchObject({ formula: "MAX(G3-C3,0)" });
    expect(at("a:over_by")).toMatchObject({ formula: "MIN(G3-C3,0)" });
    expect(at("a:lower_pct")).toMatchObject({ formula: 'IF(C3=0,"",-P3/C3)' });
    expect(at("a:new_margin")).toMatchObject({ formula: 'IF(G3=0,"",IF(B3="",0,(G3-B3)/G3))' });
    // The match candidates are text in Excel, never an object.
    expect(at("a:cand")).toBe("CIELO BLUE 3.3 · LA ESPERANZA; CIELO 3.4 · LA ESPERANZA");
  });
  it("owner 2026-11-14 18:37: the export keeps the screen's columns and adds every input a formula needs; two header rows", async () => {
    const C = (k: string, group: string, kind: GridCol["kind"] = "money"): GridCol => ({ key: k, label: k, group, kind });
    const all = [C("a:offer", "SALES"), C("a:c_list", "COMPETITOR"), C("a:c_cushion", "COMPETITOR"), C("a:c_sales", "COMPETITOR"), C("a:esp", "SALES"), C("a:over_by", "Analysis")];
    const { cols, added } = exportColumnsWithInputs([all[0]!, all[4]!, all[5]!], all);
    expect(cols.map((c) => c.key)).toEqual(["a:offer", "a:esp", "a:over_by", "a:c_list", "a:c_cushion", "a:c_sales"]);
    expect([...added].sort()).toEqual(["a:c_cushion", "a:c_list", "a:c_sales"]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await exportWorkbook(cols, [{ "a:offer": 2500, "a:c_list": 2100, "a:c_cushion": 100, "a:c_sales": 2000, "a:esp": 2000, "a:over_by": -500 } as GridRow], DEFAULT_RULES, "TIO analysis", added));
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).getCell(1).value).toBe("SALES");
    expect(ws.getRow(1).getCell(4).value).toBe("FORMULA INPUTS");
    expect(ws.getRow(2).getCell(1).value).toBe("a:offer");
    expect(ws.getRow(3).getCell(2).value).toMatchObject({ formula: "F3" });        // Esperanza price = their sales price
    expect(ws.getRow(3).getCell(6).value).toMatchObject({ formula: "D3-E3" });     // sales = list − cushion
    expect(ws.getRow(3).getCell(3).value).toMatchObject({ formula: "MIN(B3-A3,0)" });
  });
  it("wholesale and competition formulas only when their input columns are exported too", () => {
    const w = (k: string, kind: GridCol["kind"] = "money"): GridCol => ({ key: k, label: k, group: "s", kind });
    const full = exportFormulas([w("my_offer_price"), w("s:v1:price"), w("s:v1:cushion"), w("s:v1:real"), w("s:v1:diff"), w("s:v1:diff_pct", "pct"), w("comp_low_list"), w("comp_cushion"), w("comp_cost"), w("c:v1:price"), w("c:v1:earn"), w("c:v1:margin", "pct")]);
    expect(full.map((f) => f.target).sort()).toEqual(["c:v1:earn", "c:v1:margin", "comp_cost", "s:v1:diff", "s:v1:diff_pct", "s:v1:real"]);
    expect(exportFormulas([w("s:v1:price"), w("s:v1:real")]).map((f) => f.target)).toEqual([]);
  });
});

describe("Cheaper by / more expensive by (owner 2026-11-14 15:10: over by should be negative)", () => {
  const base = { upc: null, sku: null, brand: null, name: null, size: null, type: null, gender: null, purchDate: null, qtyPurch: null, cost: null, sold: null, invQty: null, lowVendor: null, lowPrice: null, minMargin: 20, myDesc: null };
  it("my offer above their real price → more expensive by is negative, % to lower positive", () => {
    const f = analysisFields({ ...base, offer: 2050, comp: { list: 2050, cushion: 50, real: 2000, desc: "X", vendor: "ESP" } });
    expect(f["a:over_by"]).toBe(-50);
    expect(f["a:lower_pct"]).toBe(2.4);
    expect(f["a:under_by"]).toBe(0);
  });
  it("my offer below → cheaper by positive, more expensive by 0", () => {
    const f = analysisFields({ ...base, offer: 1900, comp: { list: 2050, cushion: 50, real: 2000, desc: "X", vendor: "ESP" } });
    expect(f["a:under_by"]).toBe(100);
    expect(f["a:over_by"]).toBe(0);
  });
});

describe("owner 2026-11-14 19:03 CT — min purchase only where Esperanza is cheaper; the recommendation", () => {
  const base = { upc: null, sku: null, brand: null, name: null, size: null, type: null, gender: null, purchDate: null, qtyPurch: null, sold: null, invQty: null, myDesc: null, minMargin: 15 };
  const comp = (real: number) => ({ list: real + 50, cushion: 50, real, desc: "X", vendor: "ESPERANZA" });
  it("Esperanza cheaper + a supplier at or under the min purchase price → LOWER, buy there", () => {
    const f = analysisFields({ ...base, offer: 4000, cost: 3600, comp: comp(3500), lowVendor: "PCA", lowPrice: 2900 });
    expect(f["a:min_buy"]).toBe(2975);
    expect(f["a:buy_check"]).toMatch(/^YES — PCA \$29\.00/);
    expect(f["a:advice"]).toBe("LOWER to $35.00 — buy from PCA at $29.00 keeps 15%+");
  });
  it("Esperanza cheaper, no supplier cheap enough → CAN'T MATCH", () => {
    const f = analysisFields({ ...base, offer: 4000, cost: 3600, comp: comp(3500), lowVendor: "PCA", lowPrice: 3200 });
    expect(f["a:buy_check"]).toBe("NO — lowest $32.00 is $2.25 over");
    expect(f["a:advice"]).toBe("CAN'T MATCH at 15% — need cost ≤ $29.75, lowest supplier $32.00");
  });
  it("I am cheaper → no min purchase price, RAISE, and a cheaper supplier is named", () => {
    const f = analysisFields({ ...base, offer: 3000, cost: 2600, comp: comp(3500), lowVendor: "MTZ", lowPrice: 2400 });
    expect(f["a:min_buy"]).toBeNull();
    expect(f["a:buy_check"]).toBeNull();
    expect(f["a:advice"]).toBe("RAISE up to $35.00 (+$5.00) · buy from MTZ at $24.00 (your last cost $26.00)");
  });
});

describe("owner 2026-11-14 21:43 CT — my list repeats a bottle per store; the analysis shows it once", () => {
  it("one row per item: stock summed, lowest price, store count; an unlinked line stays its own row", async () => {
    const { onePerItem } = await import("./desk.service");
    const lines = [
      { id: "1", item_id: "hero", qty: 300, price_cents: 2200 },
      { id: "2", item_id: "hero", qty: 120, price_cents: 2200 },
      { id: "3", item_id: "hero", qty: 86, price_cents: 2100 },
      { id: "4", item_id: "vip", qty: null, price_cents: 7200 },
      { id: "5", item_id: null, qty: 4, price_cents: 1000 },
    ];
    const r = onePerItem(lines);
    expect(r.lines).toHaveLength(3);
    expect(r.lines.find((l) => l.item_id === "hero")).toMatchObject({ id: "1", qty: 506, price_cents: 2100, stores: 3 });
    expect(r.lines.find((l) => l.item_id === "vip")).toMatchObject({ qty: null, stores: 1 });
    expect(r.storesByItem.get("hero")).toBe(3);
    expect(r.lines.find((l) => l.item_id === null)).toMatchObject({ id: "5", stores: 1 });
  });
});

describe("owner 2026-11-15 07:10 CT — the analysis shows the same number of lines as my list", () => {
  it("buildAnalysisLines keeps every store line; STORES = lines of my list carrying that item", async () => {
    const src = (await import("node:fs")).readFileSync(new URL("./desk.service.ts", import.meta.url), "utf8");
    expect(src).toMatch(/const myLines: GridRow\[\] = x\.myLineQ\.map\(\(l\) =>/);
    expect(src).toMatch(/"a:stores": l\.item_id \? \(storesByItem\.get\(l\.item_id\) \?\? 1\) : 1/);
  });
});
