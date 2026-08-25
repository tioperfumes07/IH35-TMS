import { describe, expect, it } from "vitest";
import { properPersonOrPlaceName } from "./properDisplayText";

describe("properPersonOrPlaceName", () => {
  it("title-cases a lowercase company and city", () => {
    expect(properPersonOrPlaceName("acme freight llc")).toBe("Acme Freight Llc");
    expect(properPersonOrPlaceName("laredo")).toBe("Laredo");
  });

  it("keeps short ALL-CAPS tokens", () => {
    expect(properPersonOrPlaceName("IH35 TMS")).toBe("IH35 TMS");
  });
});
