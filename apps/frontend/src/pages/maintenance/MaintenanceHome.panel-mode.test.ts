import { describe, expect, it } from "vitest";
import ts from "typescript";
import sourceText from "./MaintenanceHome.tsx?raw";
import summaryText from "./components/MaintenanceHomeSummaryPanels.tsx?raw";
import { maintenanceTabFromPath } from "../../router/route-manifest";

const source = ts.createSourceFile("MaintenanceHome.tsx", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

describe("Maintenance Home board/workflow isolation", () => {
  it("mounts no legacy workflow beneath the Home board, even collapsed", () => {
    let board: ts.ConditionalExpression | undefined;
    function visit(node: ts.Node) {
      if (ts.isConditionalExpression(node) && node.condition.getText(source) === 'tab === "rm_status_board"') board = node;
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect(board).toBeDefined();
    const body = board!.whenTrue.getText(source);
    for (const legacy of ["RMBucketsGrid", "RMStatStrip", "IntegrationsStrip", "RoadServiceActivePanel", "DtcAutoWorkOrdersCard", "ArrivingSoonPage", "PredictiveAlertsPage", "<details"]) expect(body).not.toContain(legacy);
    expect(body).toContain("MaintenanceHomeSummaryPanels");
    expect(body).toContain("V3KpiTile");
  });
  it("summary pages cannot import or mount the full workflows", () => {
    expect(summaryText).not.toContain("ArrivingSoonPage");
    expect(summaryText).not.toContain("PredictiveAlertsPage");
    expect(summaryText).not.toContain("useMutation");
    expect(summaryText).not.toContain("logArrivingSoonView");
  });
  for (const [path, tab] of [["arriving-soon", "arriving_soon"], ["predictive-alerts", "predictive_alerts"]]) {
    it(`${path} View all opens its own full workflow, not Home again`, () => {
      expect(maintenanceTabFromPath(`/maintenance/${path}`)).toBe(tab);
      expect(maintenanceTabFromPath(`/maintenance/${path}/`)).toBe(tab);
      expect(summaryText).toContain(`/maintenance/${path}`);
    });
  }
  it("preserves status transitions in a separately selected Active WOs workflow", () => {
    expect(sourceText).toContain('tab === "active_wos" && searchParams.get("view") === "workflow"');
    expect(sourceText).toContain('/maintenance/active-wos?view=workflow');
    expect(sourceText).toMatch(/statusMutation\.mutate\(\{\s*id,\s*status,\s*companyId,\s*generation: statusGenerationRef\.current,/);
    expect(sourceText).toContain('enabled: Boolean(companyId) && (showWorkflow || tab === "road_service")');
  });
});
