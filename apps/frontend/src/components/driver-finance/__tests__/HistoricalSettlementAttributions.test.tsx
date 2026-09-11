import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HistoricalSettlementAttributions, type HistoricalSettlementAttributionRow } from "../HistoricalSettlementAttributions";
const row: HistoricalSettlementAttributionRow = { id: "a", source_settlement_id: "original", source_settlement_display_id: "S-2026-0011",
  target_settlement_id: "target", target_settlement_display_id: "S-2026-0028", source_journal_entry_id: "je", source_document_ref: "5778",
  allocation_basis: "identity_only", allocated_net_cents: null };
describe("historical settlement attribution", () => {
  it("shows original/round-trip/journal links and never invents a zero allocation or bank payment", () => {
    render(<MemoryRouter><HistoricalSettlementAttributions rows={[row]} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "S-2026-0011" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "S-2026-0028" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View journal" })).toBeTruthy();
    expect(screen.getByText("Unallocated")).toBeTruthy();
    expect(screen.queryByText("$0.00")).toBeNull();
    expect(screen.getByText(/does not establish a bank payment/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Source document/ })).toBeTruthy();
  });
  it("labels reconstructed attribution explicitly", () => {
    render(<MemoryRouter><HistoricalSettlementAttributions rows={[{ ...row, allocation_basis: "reconstructed_sources", allocated_net_cents: "44741" }]} /></MemoryRouter>);
    expect(screen.getByText("Reconstructed from sources")).toBeTruthy();
    expect(screen.getByText("$447.41")).toBeTruthy();
  });
  it("adds no historical section to an ordinary settlement", () => {
    const { container } = render(<HistoricalSettlementAttributions rows={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
