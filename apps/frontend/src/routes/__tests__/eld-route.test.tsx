import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SIDEBAR_ITEM_IDS, SIDEBAR_ITEM_META } from "../../components/layout/sidebar-config";

const manifestPath = path.join(process.cwd(), "src/routes/manifest.tsx");

describe("/eld route audit (P8-AUDIT-ELD-REDIRECT)", () => {
  it("renders EldPage at /eld with Owner gate and no redirect-to-home stub", () => {
    expect(SIDEBAR_ITEM_IDS).toContain("eld");
    expect(SIDEBAR_ITEM_META.eld.to).toBe("/eld");

    const manifest = fs.readFileSync(manifestPath, "utf8");
    const eldRouteBlock = manifest.match(/path="\/eld"[\s\S]*?<\/Route>/)?.[0] ?? "";
    expect(eldRouteBlock).toContain("<EldPage");
    expect(eldRouteBlock).toContain("<OwnerOnlyRoute>");
    expect(eldRouteBlock).not.toMatch(/<Navigate to="\/home"/);
  });
});
