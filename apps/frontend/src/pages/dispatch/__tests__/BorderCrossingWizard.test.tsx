import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { BorderCrossingWizardPage } from "../BorderCrossingWizardPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "00000000-0000-4000-8000-000000000001" }),
}));

describe("BorderCrossingWizardPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/ports-of-entry")) {
          return new Response(JSON.stringify({ ports: [{ id: "p1", name: "Laredo WTB", short_name: "WTB", country: "US", cbp_port_code: "2304" }] }));
        }
        if (url.includes("/customs-brokers")) {
          return new Response(JSON.stringify({ brokers: [] }));
        }
        if (url.includes("/wait-times")) {
          return new Response(JSON.stringify({ rows: [] }));
        }
        return new Response(JSON.stringify({}), { status: 404 });
      })
    );
  });

  it("renders six-step border crossing wizard", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <BorderCrossingWizardPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByTestId("border-crossing-wizard-page")).toBeInTheDocument();
    expect(screen.getByTestId("border-wizard-step-1")).toBeInTheDocument();
    expect(screen.getByTestId("cbp-wait-times-widget")).toBeInTheDocument();
  });
});
