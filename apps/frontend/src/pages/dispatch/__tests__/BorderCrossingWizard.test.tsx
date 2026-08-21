import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../../components/Toast";
import { describe, expect, it, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { BorderCrossingWizardPage } from "../BorderCrossingWizardPage";
import { WizardStep2 } from "../../../components/border-crossing/WizardStep2";
import { WizardStep4 } from "../../../components/border-crossing/WizardStep4";

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
        {/* ToastProvider: the page (or a child it gained) calls useToast, so every render threw
            "useToast must be used inside ToastProvider" and the test died before a single assertion.
            The app always renders this inside the provider; the harness was the unrealistic part. */}
        <MemoryRouter>
          <ToastProvider>
          <BorderCrossingWizardPage />
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByTestId("border-crossing-wizard-page")).toBeInTheDocument();
    expect(screen.getByTestId("border-wizard-step-1")).toBeInTheDocument();
    expect(screen.getByTestId("cbp-wait-times-widget")).toBeInTheDocument();
  });

  it("uses a searchable port-of-entry picker", async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <WizardStep2
          form={{ portOfEntryId: "", plannedDate: "" } as never}
          ports={[{ id: "p1", name: "Laredo WTB", short_name: "WTB", country: "US", cbp_port_code: "2304" }]}
          onChange={vi.fn()}
        />
      </QueryClientProvider>
    );

    const picker = screen.getByRole("combobox", { name: "Port of entry *" });
    expect(picker).toHaveAttribute("aria-autocomplete", "list");
    await user.click(picker);
    expect(await screen.findByText("WTB (US)")).toBeInTheDocument();
  });

  it("uses a searchable customs-broker picker", async () => {
    const user = userEvent.setup();
    render(
      <WizardStep4
        form={{ customsBrokerId: "", bondNumber: "" } as never}
        brokers={[{ id: "broker-1", name: "Rio Customs Brokerage" }]}
        operatingCompanyId="company-1"
        onChange={vi.fn()}
      />
    );

    const picker = screen.getByRole("combobox", { name: "Customs broker" });
    expect(picker).toHaveAttribute("aria-autocomplete", "list");
    await user.click(picker);
    expect(await screen.findByText("+ Add new vendor")).toBeInTheDocument();
    expect(await screen.findByText("Rio Customs Brokerage")).toBeInTheDocument();
  });
});
