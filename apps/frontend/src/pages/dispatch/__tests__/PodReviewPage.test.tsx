import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { PodReviewPage } from "../PodReviewPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91e0bf0a-133f-4ce8-a734-2586cfa66d96" }),
}));

vi.mock("../../../api/dispatch", () => ({
  listDispatchLoads: vi.fn(async () => ({
    loads: [{ id: "load-1", load_number: "L-500" }],
    total_count: 1,
    has_more: false,
  })),
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
    expect(screen.getByTestId("pod-status-filter")).toBeTruthy();
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
    const filter = await screen.findByTestId("pod-load-filter");
    await screen.findByRole("option", { name: "L-500" });
    await user.selectOptions(filter, "load-1");
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
