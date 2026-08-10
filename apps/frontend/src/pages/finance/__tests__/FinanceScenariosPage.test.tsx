import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { FinanceScenariosPage } from "../FinanceScenariosPage";

/**
 * FIN-S06: /finance/scenarios renders and, since it has no data model or backend endpoint, must
 * honestly say the feature is not available yet rather than reading like a description of a
 * working feature.
 */

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../../hooks/useFeatureFlag", () => ({
  useFeatureFlag: () => ({ enabled: false }),
}));

function wrap(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("FinanceScenariosPage (FIN-S06)", () => {
  it("renders without a blank frame", () => {
    wrap(<FinanceScenariosPage />);
    expect(screen.getByTestId("finance-scenarios-page")).toBeTruthy();
  });

  it("honestly states the feature is not available instead of describing a working feature", () => {
    wrap(<FinanceScenariosPage />);
    expect(screen.getByTestId("finance-scenarios-not-available").textContent).toMatch(/not available yet/i);
  });
});
