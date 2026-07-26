import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { RMStatStrip } from "./RMStatStrip";
import type { MaintenanceKpis } from "../../../api/maintenance";

// Render-proof for the R&M Status Board 2nd stat strip (rm-status-board.html). Token-in-source can be green
// while a tile is removed/unmounted; this mounts the strip and asserts all 8 tiles reach the DOM. If a tile
// label is deleted/renamed, getByText throws → RED.
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

const LABELS = [
  "Open WOs",
  "In Progress",
  "Awaiting Parts",
  "PM Due Soon",
  "Severe / OOS",
  "Road Service",
  "Parts Low-Stock",
  "MTD Cost",
];

const renderStrip = (kpis: MaintenanceKpis) =>
  render(
    <MemoryRouter>
      <RMStatStrip kpis={kpis} />
    </MemoryRouter>
  );

describe("RMStatStrip", () => {
  it("renders all 8 R&M stat tiles in the DOM", () => {
    renderStrip(KPIS);
    for (const label of LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  // C8 — every tile is a real drill target, not a dead click.
  it("gives all 8 tiles a drill destination", () => {
    const { container } = renderStrip(KPIS);
    expect(container.querySelectorAll("[data-kpi-drill]")).toHaveLength(LABELS.length);
    expect(screen.getByLabelText("Open WOs — view records")).toHaveAttribute(
      "href",
      "/maintenance/active-wos"
    );
  });

  // C8 — a count the payload does not carry renders "—", never a fabricated 0.
  it("renders an absent count as an em-dash instead of zero", () => {
    const { container } = renderStrip({ open_wos: 7 } as unknown as MaintenanceKpis);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-kpi-drill]")).toHaveLength(LABELS.length);
  });
});
