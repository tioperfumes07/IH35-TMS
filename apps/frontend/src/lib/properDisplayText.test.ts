import { describe, expect, it } from "vitest";
import { properPersonOrPlaceName } from "./properDisplayText";

describe("properPersonOrPlaceName", () => {
  it("title-cases a lowercase company and city", () => {
    expect(properPersonOrPlaceName("acme freight llc")).toBe("Acme Freight Llc");
    expect(properPersonOrPlaceName("laredo")).toBe("Laredo");
  });

  // Owner ruling 10-22 (443.257-B): names are proper case, never ALL CAPS — only a code token carrying a digit stays upper.
  it("keeps code tokens with a digit upper, proper-cases the words around them", () => {
    expect(properPersonOrPlaceName("LAREDO IH35 YARD")).toBe("Laredo IH35 Yard");
    expect(properPersonOrPlaceName("HUGO GAYTAN")).toBe("Hugo Gaytan");
  });
});
