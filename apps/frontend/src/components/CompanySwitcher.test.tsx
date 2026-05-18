import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CompanySwitcher } from "./CompanySwitcher";

const switchIdentityCompanyMock = vi.fn();
const setSelectedCompanyMock = vi.fn();
const setDefaultCompanyForUserMock = vi.fn(async () => undefined);
const pushToastMock = vi.fn();

vi.mock("../api/identity", () => ({
  switchIdentityCompany: (...args: unknown[]) => switchIdentityCompanyMock(...args),
}));

vi.mock("../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    companies: [
      {
        id: "c-transp",
        code: "TRANSP",
        legal_name: "IH 35 Transportation",
        short_name: "IH 35 Transportation",
        company_type: "operating_carrier",
        is_active: true,
        is_default: true,
      },
      {
        id: "c-trk",
        code: "TRK",
        legal_name: "IH 35 Trucking",
        short_name: "IH 35 Trucking",
        company_type: "operating_carrier",
        is_active: true,
        is_default: false,
      },
      {
        id: "c-usmca",
        code: "USMCA",
        legal_name: "USMCA Freight",
        short_name: "USMCA Freight",
        company_type: "operating_carrier",
        is_active: true,
        is_default: false,
      },
    ],
    selectedCompanyId: "c-transp",
    selectedCompany: {
      id: "c-transp",
      code: "TRANSP",
      legal_name: "IH 35 Transportation",
      short_name: "IH 35 Transportation",
      company_type: "operating_carrier",
      is_active: true,
      is_default: true,
    },
    isLoading: false,
    setSelectedCompany: setSelectedCompanyMock,
    setDefaultCompanyForUser: setDefaultCompanyForUserMock,
  }),
}));

vi.mock("./Toast", () => ({
  useToast: () => ({ pushToast: pushToastMock }),
}));

describe("CompanySwitcher", () => {
  it("renders switch actions for all non-active companies", async () => {
    switchIdentityCompanyMock.mockResolvedValue({
      operating_company_id: "c-trk",
      company_name: "IH 35 Trucking",
      company_legal_name: "IH 35 Trucking",
      user_role: "Owner",
      available_companies: [],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <CompanySwitcher />
      </QueryClientProvider>
    );

    await user.click(screen.getByRole("button", { name: /current:/i }));
    const switchButtons = screen.getAllByRole("button", { name: "Switch" });
    expect(switchButtons).toHaveLength(2);
  });
});
