// @vitest-environment jsdom
// LV-FINANCE-AMORTIZATION-CREATE-UNGATED-RAW-DATE — proves the create button stays disabled with
// blank/incomplete fields (no round trip fired at all, not even a doomed-to-400 one), that filling
// every required field enables it and creates with the entered values, and that no raw native
// <input type="date"> renders (the shared DatePicker is used instead).
import * as matchers from "@testing-library/jest-dom/matchers";
import type { ReactElement } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as financeAmortizationApi from "../../api/financeAmortization";
import { AmortizationPage } from "./AmortizationPage";

expect.extend(matchers);

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../hooks/useFeatureFlag", () => ({
  useFeatureFlag: () => ({ enabled: true, loading: false, error: null }),
}));

vi.mock("../../api/financeAmortization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/financeAmortization")>();
  return {
    ...actual,
    listLoans: vi.fn().mockResolvedValue({ loans: [] }),
    createLoan: vi.fn(),
  };
});

function wrap(ui: ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe("AmortizationPage create gate (LV-FINANCE-AMORTIZATION-CREATE-UNGATED-RAW-DATE)", () => {
  beforeEach(() => {
    vi.mocked(financeAmortizationApi.createLoan).mockReset();
  });

  it("never renders a raw native date input", async () => {
    render(wrap(<AmortizationPage />));
    await screen.findByText("New loan");
    expect(document.querySelectorAll('input[type="date"]').length).toBe(0);
  });

  it("keeps Create disabled with the default (name/principal/date all blank) form", async () => {
    render(wrap(<AmortizationPage />));
    await screen.findByText("New loan");
    expect(screen.getByTestId("amortization-create-button")).toBeDisabled();
    expect(financeAmortizationApi.createLoan).not.toHaveBeenCalled();
  });

  it("enables Create once name/principal/term/date are all filled, and posts the entered values", async () => {
    const user = userEvent.setup();
    vi.mocked(financeAmortizationApi.createLoan).mockResolvedValue({
      loan: {
        id: "loan-1",
        name: "Truck note",
        lender: null,
        original_principal_cents: 1_000_000,
        interest_rate_bps: 500,
        term_months: 60,
        first_payment_date: "2026-09-01",
        loan_type: "note_payable",
        status: "active",
      },
      rows: [],
    });

    render(wrap(<AmortizationPage />));
    await screen.findByText("New loan");

    const createButton = screen.getByTestId("amortization-create-button");
    expect(createButton).toBeDisabled();

    await user.type(screen.getByLabelText("Name"), "Truck note");
    expect(createButton).toBeDisabled();

    const principalInput = screen.getByLabelText("Principal ($)");
    await user.type(principalInput, "10000");
    // Term (months) already defaults to "60" — only the date is still missing.
    expect(createButton).toBeDisabled();

    const datePicker = screen.getByTestId("amortization-firstPaymentDate");
    await user.click(within(datePicker).getByRole("button"));
    await user.click(await screen.findByRole("button", { name: "1" }));

    await waitFor(() => expect(createButton).toBeEnabled());
    await user.click(createButton);

    await waitFor(() => expect(financeAmortizationApi.createLoan).toHaveBeenCalledTimes(1));
    const call = vi.mocked(financeAmortizationApi.createLoan).mock.calls[0]![0];
    expect(call.name).toBe("Truck note");
    expect(call.original_principal_cents).toBe(1_000_000);
    expect(call.term_months).toBe(60);
    expect(call.first_payment_date).toMatch(/^\d{4}-\d{2}-01$/);
  });
});
