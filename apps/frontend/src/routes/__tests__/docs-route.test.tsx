import { describe, expect, it } from "vitest";
import { SIDEBAR_ITEM_IDS, SIDEBAR_ITEM_META } from "../../components/layout/sidebar-config";
import manifestSource from "../manifest.tsx?raw";

describe("/docs route audit (P8-AUDIT-DOCS-REDIRECT)", () => {
  it("renders DocsHomePage at /docs with Owner/Admin gate and no redirect-to-home stub", () => {
    expect(SIDEBAR_ITEM_IDS).toContain("docs");
    expect(SIDEBAR_ITEM_META.docs.to).toBe("/docs");

    const docsRouteBlock = manifestSource.match(/path="\/docs"[\s\S]*?<\/Route>/)?.[0] ?? "";
    expect(docsRouteBlock).toContain("<DocsHomePage");
    expect(docsRouteBlock).toContain("<OwnerAdminRoute>");
    expect(docsRouteBlock).not.toMatch(/<Navigate to="\/home"/);
  });
});
