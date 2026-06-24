import { render, screen } from "@testing-library/react";
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

describe("RMStatStrip", () => {
  it("renders all 8 R&M stat tiles in the DOM", () => {
    render(<RMStatStrip kpis={KPIS} />);
    for (const label of [
      "Open WOs",
      "In Progress",
      "Awaiting Parts",
      "PM Due Soon",
      "Severe / OOS",
      "Road Service",
      "Parts Low-Stock",
      "MTD Cost",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
