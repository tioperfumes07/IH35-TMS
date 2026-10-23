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

  // ROUND 443.258-B — Google practical + short always under (even when not computed).
  it("always shows Google practical and short lines under the boxes", () => {
    render(<MilesStrip newLane />);
    expect(screen.getByTestId("book-load-google-reference-miles")).toHaveTextContent("Google practical — not computed yet");
    expect(screen.getByTestId("book-load-google-reference-short")).toHaveTextContent("Google short — not computed yet");
    expect(screen.getByTestId("book-load-google-reference-empty")).toHaveTextContent("Empty leg ref");
  });

  it("renders Google practical + short values when provided", () => {
    render(
      <MilesStrip
        googleReferencePractical={{ miles: 412.5, minutes: 380 }}
        googleReferenceEmpty={{ miles: 18.2, minutes: 28 }}
      />,
    );
    expect(screen.getByTestId("book-load-google-reference-miles")).toHaveTextContent("Google practical 412.5 mi");
    expect(screen.getByTestId("book-load-google-reference-short")).toHaveTextContent("Google short 412.5 mi");
    expect(screen.getByTestId("book-load-google-reference-empty")).toHaveTextContent("18.2 mi");
  });
});
