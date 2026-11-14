import { describe, expect, it } from "vitest";
import pm from "./MaintenancePmCountdownCards.tsx?raw";
import engines from "./MaintEnginesStatusWidget.tsx?raw";
import alerts from "./MaintenanceAlertsCard.tsx?raw";
import triage from "./InTransitTriageBand.tsx?raw";
import severe from "./SevereAlertsBand.tsx?raw";

// ROUND 9.0 (owner 2026-11-13, docs/design/v3/Maintenance-Home.png): the right-column monitors are the design's
// side cards (one shared V3SideCard: UPPERCASE title · count right · grey line), replacing the 443.280 V3Panel rule.
describe("ROUND 9.0 Home monitors share the board side-card contract", () => {
  for (const [name, source] of Object.entries({ pm, engines, alerts, triage, severe })) {
    it(`${name} uses V3SideCard, not a second independent card header`, () => {
      expect(source).toContain('import { V3SideCard }');
      expect(source).toContain("<V3SideCard title=");
    });
  }
  it("preserves source drill-through, pagination, triage and full-population severe totals", () => {
    expect(pm).toContain('hrefWithRet("/maintenance/pm-schedule")');
    expect(engines).toContain('data-testid="maint-engines-full-board-link"');
    expect(alerts).toContain('data-testid="pm-alerts-compact-pager"');
    expect(triage).toContain("onTriage(issue)");
    expect(severe).toContain('data-testid="severe-alerts-total-all"');
  });
});
