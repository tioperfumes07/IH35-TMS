/** Owner 2026-11-16 16:31 CT: PCA, MTZ, Elegance, MR Distributors first, then the rest A–Z; the lowest price on an item is
 *  shaded and every tie at that price the same shade. */
import { describe, expect, it } from "vitest";
import { orderVendors, priceFamilies } from "./desk.service.js";

describe("vendor order", () => {
  it("puts PCA, MTZ, ELEGANCE, M&R DIST first, then A–Z by the column header", () => {
    const vs = ["PPW BLK FRI", "AWESOME", "M&R DIST", "PPW", "ELEGANCE", "B&S", "MTZ", "PCA", "zeta"].map((s) => ({ name: `${s} full`, short_name: s }));
    expect(orderVendors(vs).map((v) => v.short_name)).toEqual(["PCA", "MTZ", "ELEGANCE", "M&R DIST", "AWESOME", "B&S", "PPW", "PPW BLK FRI", "zeta"]);
  });
  it("a vendor without a short name sorts by its name", () => {
    const vs = [{ name: "Zed", short_name: null }, { name: "Alpha", short_name: null }, { name: "x", short_name: "MTZ" }];
    expect(orderVendors(vs).map((v) => v.name)).toEqual(["x", "Alpha", "Zed"]);
  });
});

describe("lowest-price families", () => {
  it("groups like with like and skips cushions, differences and single columns", () => {
    const keys = ["upc", "v:a:price", "v:a:net", "v:b:price", "v:b:net", "s:c:real", "s:c:diff", "v:c:cush", "best_price"];
    const fams = priceFamilies(keys, () => true);
    expect(fams).toEqual([[1, 3], [2, 4]]);
  });
});
