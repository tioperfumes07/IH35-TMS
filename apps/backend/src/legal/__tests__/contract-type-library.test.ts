import { describe, expect, it } from "vitest";
import { CONTRACT_TYPE_TEMPLATES, deriveTrailerLease } from "../templates/contract-type-library.js";
import { TRUCK_LEASE_CONTENT_HTML_EN } from "../templates/truck-lease.template.js";

describe("contract type print designs", () => {
  it("trailer lease is the truck lease design with trailers, no trucks left", () => {
    const t = CONTRACT_TYPE_TEMPLATES.trailer_lease.htmlEn;
    expect(t).toMatch(/Commercial Trailer Lease Agreement/);
    expect(t).not.toMatch(/\bTruck\b|\btruck\b/);
    expect(t.match(/<style[\s\S]*?<\/style>/)?.[0]).toBe(TRUCK_LEASE_CONTENT_HTML_EN.match(/<style[\s\S]*?<\/style>/)?.[0]);
    expect(deriveTrailerLease("one vehicle per month per vehicle", "en")).toBe("one trailer per month per trailer");
    // template tokens keep binding to the data shape
    expect(t).toContain("{{#each vehicles}}");
    expect(deriveTrailerLease("<p>{{#each vehicles}}a vehicle{{/each}}</p>", "en")).toBe("<p>{{#each vehicles}}a trailer{{/each}}</p>");
  });
  it("transportation services agreement prints with the same stylesheet and both signature blocks", () => {
    const s = CONTRACT_TYPE_TEMPLATES.transportation_services_agreement.htmlEn;
    expect(s).toMatch(/Transportation Services Agreement/);
    expect(s).toMatch(/49 U\.S\.C\. § 14706/);
    expect(s).toMatch(/\{\{carrier\.legal_name\}\}[\s\S]*\{\{customer\.legal_name\}\}/);
    expect(s).toContain(TRUCK_LEASE_CONTENT_HTML_EN.match(/<style[\s\S]*?<\/style>/)?.[0] ?? "<style");
  });
});
