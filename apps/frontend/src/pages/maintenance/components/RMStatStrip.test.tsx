import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { RMStatStrip } from "./RMStatStrip";
import type { MaintenanceKpis } from "../../../api/maintenance";

// C-36 — strip keeps only the four tiles that are NOT kanban column counts.
const KPIS = {
  open_wos: 7,
  in_shop: 0,
  past_due_pm: 0,
  out_of_service: 0,
  open_damage: 0,
  avg_wo_age_days: 0,
  mtd_repair_cost: 12480,
  mtd_parts_cost: 0,
  avg_wo_cost: 0,
  top_vendor: null,
  top_failure: null,
  pending_qbo: 0,
  pm_due: 5,
  in_progress: 3,
  waiting_parts: 2,
  severe_oos: 1,
  road_service: 1,
  parts_low_stock: 4,
} as unknown as MaintenanceKpis;

const LABELS = ["PM Due Soon", "Road Service", "Parts Low-Stock", "MTD Cost"];
const REMOVED = ["Open WOs", "In Progress", "Awaiting Parts", "Severe / OOS"];

const renderStrip = (kpis: MaintenanceKpis) =>
  render(
    <MemoryRouter>
      <RMStatStrip kpis={kpis} />
    </MemoryRouter>
  );

describe("RMStatStrip", () => {
  it("renders the 4 non-kanban R&M stat tiles (C-36)", () => {
    renderStrip(KPIS);
    for (const label of LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    for (const label of REMOVED) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("gives all remaining tiles a drill destination", () => {
    const { container } = renderStrip(KPIS);
    expect(container.querySelectorAll("[data-kpi-drill]")).toHaveLength(LABELS.length);
    expect(screen.getByLabelText("Road Service — view records")).toHaveAttribute(
      "href",
      "/maintenance/road-service"
    );
  });

  it("renders an absent count as an em-dash instead of zero", () => {
    const { container } = renderStrip({ open_wos: 7 } as unknown as MaintenanceKpis);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-kpi-drill]")).toHaveLength(LABELS.length);
  });
});
