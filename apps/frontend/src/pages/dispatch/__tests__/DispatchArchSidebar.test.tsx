import { describe, expect, it } from "vitest";
import { getSidebarFlyoutItems, type SidebarFlyoutLink } from "../../../components/layout/sidebar-config";

describe("dispatch sidebar flyout (B21-D2)", () => {
  it("includes three new arch tab links", () => {
    const links = getSidebarFlyoutItems("dispatch", "Dispatcher");
    const paths = links.map((link: SidebarFlyoutLink) => link.to);
    expect(paths).toContain("/dispatch/at-risk");
    expect(paths).toContain("/dispatch/in-transit-issues");
    expect(paths).toContain("/dispatch/assignment-history");
  });
});
