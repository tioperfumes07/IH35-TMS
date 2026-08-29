import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LoanWizardPage } from "./LoanWizardPage";
import * as flagHook from "../../hooks/useFeatureFlag";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91e0bf0a-133f-4ce8-a734-2586cfa66d96" }),
}));

vi.mock("../../hooks/useFeatureFlag", () => ({ useFeatureFlag: vi.fn() }));

vi.mock("./FinanceModuleTabs", () => ({ FinanceModuleTabs: () => null }));

function renderWizard(state?: Record<string, string>) {
  vi.mocked(flagHook.useFeatureFlag).mockReturnValue({ enabled: true, loading: false, error: null });
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/finance/loan-wizard", state }]}>
      <Routes>
        <Route path="/finance/loan-wizard" element={<LoanWizardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// GO-0043-CALCULATOR-LOAN-WIZARD-DATA-LOSS: LoanWizardPage previously never read anything from
// navigation state -- a click from CalculatorPage's "Use this scenario -> create loan" link
// always landed on a fully blank form, silently discarding every number the user just computed.
describe("LoanWizardPage — incoming scenario state (GO-0043)", () => {
  it("pre-fills the form from CalculatorPage's router state", () => {
    renderWizard({
      purchasePrice: "50000",
      downPayment: "5000",
      firstPaymentDate: "2026-09-01",
      annualRatePct: "6.5",
      termMonths: "48",
    });

    expect(screen.getByLabelText(/Annual rate/i)).toHaveValue(6.5);
    expect(screen.getByLabelText(/Term \(months\)/i)).toHaveValue(48);
    expect(screen.getByLabelText(/Purchase price/i)).toHaveValue("50,000.00");
    expect(screen.getByLabelText(/Down payment/i)).toHaveValue("5,000.00");
  });

  it("still renders the established blank defaults when reached with no incoming state (direct navigation, unaffected)", () => {
    renderWizard(undefined);

    expect(screen.getByLabelText(/Annual rate/i)).toHaveValue(null);
    expect(screen.getByLabelText(/Term \(months\)/i)).toHaveValue(60);
    expect(screen.getByLabelText(/Purchase price/i)).toHaveValue("");
  });
});
