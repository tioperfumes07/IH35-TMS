import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SettlementNumberBox } from "./components/SettlementNumberBox";
import { SettlementsTable } from "./components/SettlementsTable";
import { tourLoadColumns } from "../../components/dispatch/TourLegsCell";
import { ParityTable } from "../../components/parity/ParityTable";
import type { SettlementListRow } from "../../api/driverFinance";
import type { TourListRow } from "../../api/tourReadout";

describe("REG-010/011 canonical settlement identity and one datum per column", () => {
  it("renders settlement identity read-only without an overwrite action", () => {
    render(<SettlementNumberBox displayId="S-2026-0042" />);
    expect(screen.getByTestId("settlement-number-box-frozen")).toHaveTextContent("S-2026-0042");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("keeps source reference, canonical settlement, load and period endpoints in separate cells", () => {
    const row = { id: "settlement-1", display_id: "S-2026-0042", source_document_ref: "5795", driver_id: "driver-1", driver_full_name: "Driver One", period_start: "2026-09-01", period_end: "2026-09-10", load_count: 1, load_links: [{id: "load-1", label: "13508"}], status: "presettle" } as SettlementListRow;
    render(<MemoryRouter><SettlementsTable rows={[row]} onOpen={() => {}} /></MemoryRouter>);
    for (const label of ["Settlement/Tour", "Load Number", "Source reference", "Period Begin", "Period End"]) {
      expect(screen.getByRole("columnheader", {name: new RegExp(label, "i")})).toBeInTheDocument();
    }
    // SETTLEMENT-NUMBER-IS-ALWAYSTRACK-DOC (owner 2026-09-11): the Settlement/Tour cell IS the AlwaysTrack
    // doc (source_document_ref 5795). The retired S-YYYY-NNNN counter is never rendered anywhere on the row.
    expect(screen.queryByText("S-2026-0042")).not.toBeInTheDocument();
    const settlement = screen.getAllByText("5795").map((el) => el.closest("a")).find(Boolean);
    expect(settlement).toHaveAttribute("href", expect.stringContaining("settlement-1"));
    expect(settlement!.closest("td")).not.toHaveTextContent("13508");
    expect(settlement!.closest("td")).not.toHaveTextContent("2026-09-01");
  });
  it("renders EVERY load in the tour, one column per leg, not just the first (owner 2026-09-11: 'FIX THE RENDER, NOT THE SCHEMA' — a settlement/tour can cover multiple loads; owner 2026-09-28 ROUND 155.15 FIX B: 'EACH LOAD NUMBER SHOULD HAVE ITS OWN COLUMN. NOT VARIOUS IN ONE.')", () => {
    const row = { settlement_id: "s1", leg_count: 2, legs: [{load_id:"l1", load_number:"13508", trip_type:"NB"},{load_id:"l2",load_number:"13509",trip_type:"SB"}] } as TourListRow;
    render(<MemoryRouter><ParityTable rows={[row]} rowKey={r=>r.settlement_id} columns={tourLoadColumns("proof", [row])} /></MemoryRouter>);
    // Two legs -> two generated columns, each with its own header and its own cell.
    expect(screen.getByRole("columnheader", {name:/^Leg 1\b/i})).toBeInTheDocument();
    expect(screen.getByRole("columnheader", {name:/^Leg 2\b/i})).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", {name:/^Leg 3\b/i})).not.toBeInTheDocument();
    const leg1Cell = screen.getByRole("columnheader", {name:/^Leg 1\b/i}).closest("table")!;
    expect(within(leg1Cell).getByText(/13508/)).toBeInTheDocument();
    expect(within(leg1Cell).getByText(/13509/)).toBeInTheDocument();
    // Load count stays its own, separately-sortable column.
    expect(screen.getByRole("columnheader", {name:/Load count/i})).toBeInTheDocument();
    // The old legs[0]-only Trip type column is gone.
    expect(screen.queryByRole("columnheader", {name:/^Trip type$/i})).not.toBeInTheDocument();
  });
  it("generates only as many leg columns as the widest row needs (never hard-coded)", () => {
    const oneLeg = { settlement_id: "s1", leg_count: 1, legs: [{load_id:"l1", load_number:"13508", trip_type:"NB"}] } as TourListRow;
    const threeLegs = { settlement_id: "s2", leg_count: 3, legs: [
      {load_id:"l2", load_number:"13509", trip_type:"NB"},
      {load_id:"l3", load_number:"13510", trip_type:"TR"},
      {load_id:"l4", load_number:"13511", trip_type:"SB"},
    ] } as TourListRow;
    render(<MemoryRouter><ParityTable rows={[oneLeg, threeLegs]} rowKey={r=>r.settlement_id} columns={tourLoadColumns("proof2", [oneLeg, threeLegs])} /></MemoryRouter>);
    expect(screen.getByRole("columnheader", {name:/^Leg 3\b/i})).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", {name:/^Leg 4\b/i})).not.toBeInTheDocument();
  });
});
