import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { DriverHosClocksBlock } from "./DriverHosClocks";

// GUARD render-guard upgrade (2026-06-23): token-in-source is NOT enough — a required field can exist in
// the file but render nothing (the #1355 false-DONE: DriverHosClocksBlock returned null when no driver was
// selected, so the wizard's default state showed no HOS block while the parity guard still passed). This
// test mounts the block in its hardest state — NO driver selected — and asserts the design's 6-clock set is
// actually in the DOM. If anyone re-adds an early `return null`, this fails.

function withClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("DriverHosClocksBlock — renders in the wizard even with no driver", () => {
  it("shows the heading and all 6 HOS clock labels with no driver selected", () => {
    render(withClient(<DriverHosClocksBlock driverId="" operatingCompanyId="co-1" heading="Driver HOS (hours of service)" />));

    expect(screen.getByText("Driver HOS (hours of service)")).toBeInTheDocument();
    // The Samsara-standard 6-clock set must be on screen regardless of driver/data state.
    for (const label of ["Drive", "Shift", "Break", "Cycle", "Stop By", "Resume At"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Empty state hint (no fabricated values).
    // render-v6 §B exact hosNote text.
    expect(
      screen.getByText(/Select a driver to load HOS\. Clocks populate from the Samsara feed\. Stop by \/ Resume at are projected\./)
    ).toBeInTheDocument();
  });
});
