import { describe, expect, it } from "vitest";
import pm from "./MaintenancePmCountdownCards.tsx?raw";
import engines from "./MaintEnginesStatusWidget.tsx?raw";
import alerts from "./MaintenanceAlertsCard.tsx?raw";
import triage from "./InTransitTriageBand.tsx?raw";
import severe from "./SevereAlertsBand.tsx?raw";

describe("443.280 Home monitors share the board panel contract", () => {
  for (const [name, source] of Object.entries({ pm, engines, alerts, triage, severe })) {
    it(`${name} uses V3Panel, not a second independent panel header`, () => {
      expect(source).toContain('import { V3Panel }');
      expect(source).toContain("<V3Panel title=");
    });
  }
  it("preserves source drill-through, pagination, triage and full-population severe totals", () => {
    expect(pm).toContain('to="/maintenance/pm-schedule"');
    expect(engines).toContain('data-testid="maint-engines-full-board-link"');
    expect(alerts).toContain('data-testid="pm-alerts-compact-pager"');
    expect(triage).toContain("onTriage(issue)");
    expect(severe).toContain('data-testid="severe-alerts-total-all"');
  });
});
