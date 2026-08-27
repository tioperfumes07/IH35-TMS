import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { DriverHosClockValue, DriverHosClocksBlock } from "./DriverHosClocks";
import { HOS_COLUMNS } from "./hosClocks";

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

// HOS-RETRY-CONCAT: DispatchBoard/DispatchList each mount one <DriverHosClockValue> PER HOS_COLUMNS
// entry (6 per row), all sharing the same react-query cache key — so when the HOS fetch errors, all 6
// error together. Before the fix, each independently rendered its own <HosRetryButton/> with no
// separator, producing "RetryRetryRetryRetryRetryRetry" (live-reproduced on /dispatch?view=list this
// session — L-20260806-0008 and 3 sibling loads for driver "Juan USMCA-Battery"). The fix: only the
// column passed `showRetryOnError` renders a Retry control; the other 5 render the same "—" every other
// error cell already shows.

vi.mock("../../../api/dispatch", () => ({
  getDriverHosStatus: vi.fn(() => Promise.reject(new Error("404"))),
}));

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("DriverHosClockValue — HOS-RETRY-CONCAT", () => {
  it("renders exactly ONE Retry button across all 6 HOS_COLUMNS instances for one row, matching DispatchBoard/DispatchList's real usage", async () => {
    renderWithClient(
      <>
        {HOS_COLUMNS.map((col, index) => (
          <DriverHosClockValue
            key={col.key}
            driverId="d-juan-usmca-battery"
            operatingCompanyId="co-usmca"
            colKey={col.key}
            showRetryOnError={index === 0}
          />
        ))}
      </>
    );
    const retryButtons = await screen.findAllByRole("button", { name: "Retry driver HOS" });
    expect(retryButtons).toHaveLength(1);
  });

  it("defaults showRetryOnError to false — a caller that forgets the prop gets NO retry button, never a silent duplicate", async () => {
    renderWithClient(<DriverHosClockValue driverId="d-1" operatingCompanyId="co-1" colKey={HOS_COLUMNS[0].key} />);
    // Wait for the query to settle into its error state (retry:false in the test client above).
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("button", { name: "Retry driver HOS" })).not.toBeInTheDocument();
  });
});
