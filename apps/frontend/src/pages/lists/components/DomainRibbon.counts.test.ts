import { describe, expect, it } from "vitest";
import { DOMAIN_CATALOG_COUNTS } from "./AllCatalogsMap";
import domainModuleTabSource from "./DomainModuleTab.tsx?raw";

/**
 * Guard for #P3 — the Lists domain ribbon badges showed 0 (they read useModuleCount, whose
 * endpoint returned 0) while the All Catalogs map showed the real per-domain catalog counts.
 * The badges now read DOMAIN_CATALOG_COUNTS — the SAME source the map renders. Asserts the
 * known counts, that no domain is 0, and that DomainModuleTab no longer reads the 0-source.
 */
describe("Lists domain ribbon badge counts (#P3)", () => {
  it("matches the counts the All Catalogs map shows (Safety 6, Dispatch 5, Drivers 10)", () => {
    expect(DOMAIN_CATALOG_COUNTS.safety).toBe(6);
    expect(DOMAIN_CATALOG_COUNTS.dispatch).toBe(5);
    expect(DOMAIN_CATALOG_COUNTS.drivers).toBe(10);
  });

  it("no domain badge is zero", () => {
    const counts = Object.entries(DOMAIN_CATALOG_COUNTS);
    expect(counts.length).toBeGreaterThan(0);
    for (const [domain, count] of counts) {
      expect(count, `domain ${domain} badge is 0`).toBeGreaterThan(0);
    }
  });

  it("DomainModuleTab reads the map's count source, not the 0-returning useModuleCount", () => {
    expect(domainModuleTabSource).toContain("DOMAIN_CATALOG_COUNTS");
    expect(domainModuleTabSource).not.toContain("useModuleCount");
  });
});
