import { describe, expect, it } from "vitest";
import ts from "typescript";
import pageText from "./DriverProfilePage.tsx?raw";
import boardText from "../../components/boards/DriverOverviewBoard.tsx?raw";
import liveText from "../../components/driver-profile/DriverLiveOverview.tsx?raw";
import { DRIVER_PROFILE_STRIP_TABS, DRIVER_PROFILE_MORE_TABS, DRIVER_PROFILE_BOARD_LABELS, parseDriverProfileTab, driverProfileTabHref } from "./driverProfileTabs";

describe("443.280 Driver Profile replaces rather than layers the landing", () => {
  it("uses the four shared board panels without mislabeling pre-settlement pay as weekly pay", () => {
    expect(liveText.match(/<V3Panel\b/g)).toHaveLength(4);
    expect(liveText).toContain('title="Open pre-settlement"');
    expect(liveText).not.toContain('title="Pay this week"');
  });
  it("landing has no page-level Overview legacy blocks or details", () => {
    const page = ts.createSourceFile("page.tsx", pageText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const legacy: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isConditionalExpression(node) && node.condition.getText(page) === 'activeTab === "Overview"') legacy.push(node.whenTrue.getText(page));
      ts.forEachChild(node, visit);
    }
    visit(page);
    expect(legacy).toEqual([]);
    expect(pageText).not.toContain("<details");
    expect(pageText).toContain('activeTab === "Operations"');
    expect(pageText).toContain('activeTab === "Equipment"');
  });
  it("compact board returns before legacy cards and never fetches their extra overview", () => {
    expect(boardText).toContain('enabled: activeTab !== "Edit" && !(activeTab === "Overview" && props.compactOverview != null)');
    const start = boardText.indexOf('if (activeTab === "Overview" && props.compactOverview != null)');
    expect(start).toBeGreaterThan(0);
    const landing = boardText.slice(start, boardText.indexOf('if (activeTab === "Edit")', start));
    expect(landing).toContain("{props.compactOverview}");
    expect(landing).not.toMatch(/<details|CollapsibleProfileCard|dd-kpis/);
  });
  it("approved tabs are present while all older workflows remain reachable", () => {
    const labels = DRIVER_PROFILE_STRIP_TABS.map(tab => DRIVER_PROFILE_BOARD_LABELS[tab] ?? tab);
    for (const label of ["Profile", "QBO Mapping", "Operations", "Earnings & Debt", "Equipment Assignments", "Load History"]) expect(labels).toContain(label);
    for (const tab of [...DRIVER_PROFILE_STRIP_TABS, ...DRIVER_PROFILE_MORE_TABS]) {
      const href = driverProfileTabHref("driver-fixture", tab);
      expect(parseDriverProfileTab(new URL(href, "https://example.invalid").searchParams)).toBe(tab);
    }
  });
});
