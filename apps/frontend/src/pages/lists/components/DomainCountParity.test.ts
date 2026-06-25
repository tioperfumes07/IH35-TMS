import { describe, expect, it } from "vitest";
import ribbonTab from "./DomainModuleTab.tsx?raw";
import liveBadge from "./DomainRowCountBadge.tsx?raw";
import mapSource from "./AllCatalogsMap.tsx?raw";

/**
 * Guard for #P3 parity — the Lists domain ribbon badge and the All Catalogs map domain header badge
 * must read the SAME live count source (useModuleCount), so they can never disagree (the original bug:
 * ribbon=live-rows vs map=static catalogs.length → 6≠5, 48≠10 on prod). Source-contract (?raw).
 */
describe("Lists domain count — ribbon vs map parity (#P3)", () => {
  it("ribbon badge reads live counts via useModuleCount", () => {
    expect(ribbonTab).toContain("useModuleCount");
  });

  it("the shared live badge reads useModuleCount", () => {
    expect(liveBadge).toContain("useModuleCount");
  });

  it("the All Catalogs map renders the shared live badge, not a static catalog-type count", () => {
    expect(mapSource).toContain("DomainRowCountBadge");
    expect(mapSource).not.toMatch(/<span[^>]*>\{domain\.catalogs\.length\}<\/span>/);
  });
});
