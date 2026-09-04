import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MilesStrip } from "./MilesStrip";

describe("MilesStrip WIZ-01 lane states", () => {
  it("labels High when history filled", () => {
    render(<MilesStrip practical={412} fillConfidence="high" provenance="History · 24 runs" />);
    expect(screen.getByTestId("book-load-miles-state-high")).toHaveTextContent("High — filled from history");
  });

  it("labels Thin with history offer and keeps boxes empty of a silent fill claim", () => {
    render(
      <MilesStrip
        historyOffer={{ runs: 3, median: 390, spread: 12 }}
        onUseHistoryMiles={() => undefined}
      />,
    );
    expect(screen.getByTestId("book-load-miles-state-thin")).toHaveTextContent("Thin — boxes stay empty");
    expect(screen.getByTestId("book-load-lane-history-use")).toBeInTheDocument();
  });

  it("labels New with no history", () => {
    render(<MilesStrip newLane />);
    expect(screen.getByTestId("book-load-miles-state-new")).toHaveTextContent("New — no history");
  });
});
