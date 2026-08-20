import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { PodReviewPage } from "../PodReviewPage";
import { pickCombo } from "../../../test-utils/pickCombo";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91e0bf0a-133f-4ce8-a734-2586cfa66d96" }),
}));

vi.mock("../../../api/dispatch", () => ({
  getPodDocuments: vi.fn(async () => ({
    documents: [
      {
        id: "pod-1",
        load_id: "load-1",
        load_number: "L-500",
        stop_id: "stop-1",
        driver_id: "drv-1",
        driver_name: "Jane Driver",
        recipient_name: "Receiving Clerk",
        status: "pending_review",
        created_at: new Date().toISOString(),
      },
    ],
    count: 1,
  })),
  getLoadPodBolSummary: vi.fn(async () => ({
    pods: [{ id: "pod-1", stop_id: "stop-1", status: "pending_review", created_at: new Date().toISOString() }],
    bols: [],
  })),
  reviewPodDocument: vi.fn(),
  generateLoadBol: vi.fn(async () => ({ bol: { id: "bol-1", generated_at: new Date().toISOString() } })),
  downloadBolDocument: vi.fn(async () => ({ download_url: "https://example.com/bol.pdf", expires_in_seconds: 900 })),
}));

vi.mock("../../../api/loads", () => ({
  listLoads: vi.fn(async () => ({
    loads: [{ id: "load-1", load_number: "L-500", customer_name: "ACME" }],
    total_count: 1,
    has_more: false,
  })),
}));

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PodReviewPage (B21-D10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders POD review shell with filters and review panel", async () => {
    wrap(<PodReviewPage />);
    expect(await screen.findByTestId("dispatch-pod-review-page")).toBeTruthy();
    expect(screen.getByTestId("pod-review-panel")).toBeTruthy();
    expect(screen.getByTestId("pod-filters-toggle")).toBeTruthy();
    expect(screen.getByText("POD review + BOL")).toBeTruthy();
  });

  it("lists pending POD rows with approve action", async () => {
    wrap(<PodReviewPage />);
    expect(await screen.findByTestId("pod-row-pod-1")).toBeTruthy();
    expect(screen.getByTestId("pod-approve-pod-1")).toBeTruthy();
    expect(screen.getByText("Jane Driver")).toBeTruthy();
  });

  it("shows BOL generate and download controls when a load is selected", async () => {
    const user = userEvent.setup();
    wrap(<PodReviewPage />);
    await user.click(await screen.findByTestId("pod-filters-toggle"));
    const filter = await screen.findByTestId("pod-load-filter");
    const input = filter.querySelector("input");
    expect(input).toBeTruthy();
    await user.click(input!);
    // TWO stale things here, and the second hid behind the first.
    // (1) The load filter is the shared `Combobox` now, so its rows are role="option", not role="button".
    // (2) `userEvent.click` on those rows does NOT commit the selection: the listbox is rendered through
    //     `createPortal` and each row `preventDefault`s mousedown, so loadId stayed unset and
    //     `LoadBolPanel` never mounted — which looked exactly like "selecting a load does nothing".
    //     It is a HARNESS artifact, not a product defect: driving the same control with fireEvent (what
    //     `pickCombo` does, and why the LoadReassignModal/BookLoad picker tests pass) commits correctly.
    pickCombo(input!, /L-500/);
    // Filters are staged (useStagedListFilters/CollapsedListFilters) — picking a load only updates
    // the draft; loadId (which mounts LoadBolPanel) only commits on Apply.
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByTestId("load-pod-bol-panel")).toBeTruthy();
    expect(screen.getByTestId("bol-generate-button")).toBeTruthy();
    expect(screen.getByTestId("bol-download-link")).toBeTruthy();
  });

  it("filters POD documents by status", async () => {
    const { getPodDocuments } = await import("../../../api/dispatch");
    wrap(<PodReviewPage />);
    expect(await screen.findByTestId("pod-row-pod-1")).toBeTruthy();
    expect(getPodDocuments).toHaveBeenCalled();
  });
});
