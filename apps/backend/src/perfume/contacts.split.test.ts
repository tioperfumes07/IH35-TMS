import { describe, expect, it } from "vitest";
import { splitImportedCategories } from "./contacts.import.js";

describe("imported categories split (owner 16:54 CT not mix)", () => {
  it("review notes → tags; (Market Directory) → relationship + tag; relationships leave the industry list", () => {
    expect(splitImportedCategories(null, ["Potential customer (Market Directory)", "Beer", "Phone: US other / personal"]))
      .toEqual({ main: "Potential customer", categories: ["Beer"], tags: ["Market Directory", "Phone: US other / personal"] });
    expect(splitImportedCategories("Phone: Mexico - review", ["Perfume"])).toEqual({ main: null, categories: ["Perfume"], tags: ["Phone: Mexico - review"] });
    expect(splitImportedCategories("Customer", ["Supplier / Brand", "Cosmetics"])).toEqual({ main: "Customer", categories: ["Cosmetics"], tags: [] });
  });
});
