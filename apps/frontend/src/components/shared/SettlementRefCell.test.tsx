// @vitest-environment jsdom
// ALL-SEATS LAW (owner, 2026-09-13) — SettlementRefCell's 4 states: no tour link at all ("Not on a
// tour"), an open tour ("Open"), a closed-but-unnumbered settlement (a titled dash, never bare),
// and a real numbered settlement (deep-links via EntityLink, showing source_document_ref, NEVER
// display_id).
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
expect.extend(matchers);
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettlementRefCell } from "./SettlementRefCell";

afterEach(cleanup);

function wrap(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe("SettlementRefCell", () => {
  it('renders "Not on a tour" when there is no presettlement_link_id', () => {
    render(wrap(<SettlementRefCell loadId="L1" operatingCompanyId="C1" settlement={{ presettlement_link_id: null }} />));
    expect(screen.getByText("Not on a tour")).toBeInTheDocument();
  });

  it('renders "Open" for an open tour, never a blank or a number', () => {
    render(
      wrap(
        <SettlementRefCell
          loadId="L1"
          operatingCompanyId="C1"
          settlement={{ presettlement_link_id: "S1", status: "open", source_document_ref: null }}
        />
      )
    );
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("renders the AlwaysTrack source_document_ref as a deep link, never the internal display_id", () => {
    render(
      wrap(
        <SettlementRefCell
          loadId="L1"
          operatingCompanyId="C1"
          settlement={{ presettlement_link_id: "S1", status: "closed", source_document_ref: "5774" }}
        />
      )
    );
    const link = screen.getByText("5774");
    expect(link.closest("a")).toHaveAttribute("href", expect.stringContaining("settlement_id=S1"));
  });

  it("renders a titled dash (never bare) for a closed settlement with no document number stamped yet", () => {
    render(
      wrap(
        <SettlementRefCell
          loadId="L1"
          operatingCompanyId="C1"
          settlement={{ presettlement_link_id: "S1", status: "closed", source_document_ref: null }}
        />
      )
    );
    const dash = screen.getByText("—");
    expect(dash).toHaveAttribute("title");
    expect(dash.getAttribute("title")).not.toBe("");
  });
});
