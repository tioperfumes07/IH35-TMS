import { describe, expect, it } from "vitest";
import {
  getSidebarFlyoutItems,
  SIDEBAR_ITEM_META,
} from "../../components/layout/sidebar-config";
import financeTabsSource from "../../pages/finance/FinanceModuleTabs.tsx?raw";
import manifestSource from "../manifest.tsx?raw";

function routeBlock(path: string): string {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return manifestSource.match(
    new RegExp(`<Route\\s+path="${escaped}"[\\s\\S]*?\\/>`),
  )?.[0] ?? "";
}

describe("FIN-2 Finance landing", () => {
  it("mounts the real Hub at the canonical /finance entry", () => {
    expect(routeBlock("/finance")).toContain("<FinanceHubPage");
    expect(routeBlock("/finance")).not.toContain("<FinanceOverviewPage");
  });

  it("keeps the placeholder Overview and legacy Hub route reachable", () => {
    expect(routeBlock("/finance/overview")).toContain("<FinanceOverviewPage");
    expect(routeBlock("/finance/hub")).toContain("<FinanceHubPage");
  });

  it("sends sidebar and module-tab navigation to the matching surfaces", () => {
    expect(SIDEBAR_ITEM_META.finance.to).toBe("/finance");

    const flyout = getSidebarFlyoutItems("finance", "Owner");
    expect(flyout).toEqual(expect.arrayContaining([
      { label: "Hub", to: "/finance" },
      { label: "Overview", to: "/finance/overview" },
    ]));

    expect(financeTabsSource).toMatch(
      /id:\s*"hub",\s*label:\s*"Hub",\s*to:\s*"\/finance"/,
    );
    expect(financeTabsSource).toMatch(
      /id:\s*"overview",\s*label:\s*"Overview",\s*to:\s*"\/finance\/overview"/,
    );
  });
});
