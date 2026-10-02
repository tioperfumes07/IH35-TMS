import { describe, expect, it } from "vitest";
import { CONTRACT_TYPE_TEMPLATES, deriveTrailerLease } from "../templates/contract-type-library.js";
import { TRUCK_LEASE_CONTENT_HTML_EN, TRUCK_LEASE_CONTENT_HTML_ES } from "../templates/truck-lease.template.js";
import { needsLibraryRevision } from "../contract-type-templates.service.js";

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
  it("transportation services agreement has a real Spanish design binding the same tokens", () => {
    const { htmlEn, htmlEs } = CONTRACT_TYPE_TEMPLATES.transportation_services_agreement;
    expect(htmlEs).not.toBe(htmlEn);
    expect(htmlEs).toMatch(/<html lang="es">/);
    expect(htmlEs).toMatch(/Contrato de Servicios de Transporte/);
    expect(htmlEs).not.toMatch(/Transportation Services Agreement|Governing Law|Entire Agreement/);
    const tokens = (h: string) => [...new Set(h.match(/\{\{[^}]+\}\}/g) ?? [])].sort();
    expect(tokens(htmlEs)).toEqual(tokens(htmlEn));
    expect(htmlEs.match(/<h2>/g)?.length).toBe(htmlEn.match(/<h2>/g)?.length);
  });
  it("every lease / services design prints a real Spanish version binding the same data", () => {
    // lease_to_own is exempt by recorded decision: its English is verbatim from the owner's approved prototype and
    // its Spanish is a future reviewed version (lease-to-own.template.ts header) — not machine-drafted here.
    const designs: Array<[string, string, string]> = [
      ["truck_lease", TRUCK_LEASE_CONTENT_HTML_EN, TRUCK_LEASE_CONTENT_HTML_ES],
      ...Object.values(CONTRACT_TYPE_TEMPLATES).map((t) => [t.code, t.htmlEn, t.htmlEs] as [string, string, string]),
    ];
    const tokens = (h: string) => [...new Set(h.match(/\{\{[^}]+\}\}/g) ?? [])].sort();
    const visible = (h: string) => h.replace(/<style[\s\S]*?<\/style>/, "").replace(/<[^>]*>|\{\{[^}]*\}\}/g, " ");
    for (const [code, en, es] of designs) {
      expect(es, code).not.toBe(en);
      expect(es, code).toMatch(/<html lang="es">/);
      expect(tokens(es), code).toEqual(tokens(en));
      expect(es.match(/<h2>/g)?.length, code).toBe(en.match(/<h2>/g)?.length);
      expect(visible(es), code).not.toMatch(/\b(Parties|Governing Law|Entire Agreement|Lessor|Lessee|Signature|Truck|Trailer)\b/);
    }
  });
  it("revises only unedited library copies whose design changed", () => {
    const def = { htmlEn: "EN", htmlEs: "ES" };
    expect(needsLibraryRevision({ content_html_en: "EN", content_html_es: "EN" }, def)).toBe(true);
    expect(needsLibraryRevision({ content_html_en: "EN", content_html_es: "ES" }, def)).toBe(false);
    expect(needsLibraryRevision({ content_html_en: "EDITED", content_html_es: "EN" }, def)).toBe(false);
  });
});
