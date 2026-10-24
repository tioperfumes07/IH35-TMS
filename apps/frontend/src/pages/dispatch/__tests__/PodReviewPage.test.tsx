import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { PodReviewPage } from "../PodReviewPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91e0bf0a-133f-4ce8-a734-2586cfa66d96" }),
}));

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
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
    loads: [{ id: "load-1", load_number: "L-500", customer_name: "ACME" }, { id: "load-2", load_number: "L-501", customer_name: "ACME" }],
    total_count: 2,
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
    await user.click(within(filter).getByRole("button"));
    await user.click(await within(filter).findByRole("button", { name: /L-500/ }));
    // Filters are staged (useStagedListFilters/CollapsedListFilters) — picking a load only updates
    // the draft; loadId (which mounts LoadBolPanel) only commits on Apply.
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByTestId("load-pod-bol-panel")).toBeTruthy();
    expect(screen.getByTestId("bol-generate-button")).toBeTruthy();
    const download = screen.getByTestId("bol-download-link");
    expect(download).toBeTruthy();
    expect(download.getAttribute("href")).toContain("/api/v1/dispatch/loads/load-1/bol.pdf");
  });

  it("applies both loads without passing a CSV to a single-load BOL panel", async () => {
    const { getPodDocuments } = await import("../../../api/dispatch");
    const user = userEvent.setup();
    wrap(<PodReviewPage />);
    await user.click(await screen.findByTestId("pod-filters-toggle"));
    const filter = within(await screen.findByTestId("pod-load-filter"));
    await user.click(filter.getByRole("button"));
    await user.click(await filter.findByRole("button", { name: /L-500/ }));
    await user.click(await filter.findByRole("button", { name: /L-501/ }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(getPodDocuments).toHaveBeenLastCalledWith(expect.any(String), { status: "pending_review", load_id: "load-1,load-2" }));
    expect(screen.queryByTestId("load-pod-bol-panel")).not.toBeInTheDocument();
  });

  it("filters POD documents by status", async () => {
    const { getPodDocuments } = await import("../../../api/dispatch");
    wrap(<PodReviewPage />);
    expect(await screen.findByTestId("pod-row-pod-1")).toBeTruthy();
    expect(getPodDocuments).toHaveBeenCalled();
  });
});
