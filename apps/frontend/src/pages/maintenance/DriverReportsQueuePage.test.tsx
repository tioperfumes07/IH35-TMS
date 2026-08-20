import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DriverReportsQueuePage } from "./DriverReportsQueuePage";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "00000000-0000-4000-8000-000000000001", companies: [] }),
}));

vi.mock("../../api/maintenance", () => ({
  listDriverReports: vi.fn().mockResolvedValue({ rows: [] }),
  updateDriverReportStatus: vi.fn(),
}));

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

describe("DriverReportsQueuePage", () => {
  it("renders queue heading", async () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <DriverReportsQueuePage />
      </QueryClientProvider>
    );
    expect(await screen.findByText("Driver Reports Queue")).toBeTruthy();
  });
});
