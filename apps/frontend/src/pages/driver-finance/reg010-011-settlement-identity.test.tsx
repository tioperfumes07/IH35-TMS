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
    const settlement = screen.getByText("S-2026-0042");
    expect(settlement.closest("a")).toHaveAttribute("href", expect.stringContaining("settlement-1"));
    expect(settlement.closest("td")).not.toHaveTextContent("13508");
    expect(settlement.closest("td")).not.toHaveTextContent("5795");
    expect(screen.getByText("5795").closest("td")).not.toBe(settlement.closest("td"));
  });
  it("renders EVERY load in the tour in the Load Number cell, not just the first (owner 2026-09-11: 'FIX THE RENDER, NOT THE SCHEMA' — a settlement/tour can cover multiple loads)", () => {
    const row = { settlement_id: "s1", leg_count: 2, legs: [{load_id:"l1", load_number:"13508", trip_type:"NB"},{load_id:"l2",load_number:"13509",trip_type:"SB"}] } as TourListRow;
    render(<MemoryRouter><ParityTable rows={[row]} rowKey={r=>r.settlement_id} columns={tourLoadColumns("proof")} /></MemoryRouter>);
    const loadCell = screen.getByTestId("tour-legs-cell");
    // Both loads render in the same cell now — neither is dropped.
    expect(within(loadCell).getByText(/13508/)).toBeInTheDocument();
    expect(within(loadCell).getByText(/13509/)).toBeInTheDocument();
    // Load count stays its own, separately-sortable column alongside the full load list.
    expect(screen.getByText("2").closest("td")).not.toBe(loadCell.closest("td"));
    expect(screen.getByRole("columnheader", {name:/Load count/i})).toBeInTheDocument();
    expect(screen.getByRole("columnheader", {name:/Load Number/i})).toBeInTheDocument();
  });
});
