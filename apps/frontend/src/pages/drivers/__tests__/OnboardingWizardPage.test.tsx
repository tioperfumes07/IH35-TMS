import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as onboardingApi from "../../../api/onboarding";
import { OnboardingWizardPage } from "../OnboardingWizardPage";

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const sessionId = "a1111111-1111-4111-8111-111111111111";

const baseSession = {
  id: sessionId,
  operating_company_id: companyId,
  driver_id: "d1111111-1111-4111-8111-111111111111",
  current_step: 1,
  status: "in_progress" as const,
  step_data: {},
  admin_override: false,
  admin_override_reason: null,
  admin_override_by: null,
  created_at: "2026-06-04T12:00:00Z",
  updated_at: "2026-06-04T12:00:00Z",
  completed_at: null,
};

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: companyId }),
}));

vi.mock("../../../api/mdata", () => ({
  listUnits: vi.fn(async () => ({ units: [{ id: "u1", unit_number: "101" }] })),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/drivers/onboarding/${sessionId}`]}>
        <Routes>
          <Route path="/drivers/onboarding/:session_id" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("OnboardingWizardPage (A24-8)", () => {
  beforeEach(() => {
    vi.spyOn(onboardingApi, "getOnboardingSession").mockResolvedValue({
      session: baseSession,
      steps: onboardingApi.ONBOARDING_STEP_LABELS.map((_, i) => `step-${i}`),
    });
    vi.spyOn(onboardingApi, "saveOnboardingStep").mockResolvedValue({
      session: { ...baseSession, current_step: 2, step_data: { identity: { first_name: "Jane" } } },
    });
    vi.spyOn(onboardingApi, "completeOnboardingSession").mockResolvedValue({
      session: { ...baseSession, status: "completed", current_step: 7 },
    });
    vi.spyOn(onboardingApi, "adminOverrideOnboardingSession").mockResolvedValue({
      session: {
        ...baseSession,
        status: "completed",
        admin_override: true,
        admin_override_reason: "Verified offline",
      },
    });
  });

  it("renders 7-step wizard at /drivers/onboarding/:session_id", async () => {
    render(wrap(<OnboardingWizardPage />));
    expect(await screen.findByTestId("onboarding-wizard-page")).toBeInTheDocument();
    expect(screen.getByText("1. Identity")).toBeInTheDocument();
    expect(screen.getByText("7. Vehicle Assignment")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-step-identity")).toBeInTheDocument();
  });

  it("shows step navigation labels for all onboarding steps", async () => {
    render(wrap(<OnboardingWizardPage />));
    await screen.findByTestId("onboarding-wizard-page");
    for (const label of ["CDL Upload", "Medical Card", "DQF Docs", "Signatures", "I-9"]) {
      expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
    }
  });

  it("loads session via onboarding API", async () => {
    render(wrap(<OnboardingWizardPage />));
    await waitFor(() => {
      expect(onboardingApi.getOnboardingSession).toHaveBeenCalledWith(sessionId, companyId);
    });
  });

  it("exposes admin override panel for in-progress sessions", async () => {
    render(wrap(<OnboardingWizardPage />));
    await screen.findByTestId("onboarding-wizard-page");
    await userEvent.click(screen.getByRole("button", { name: "Admin override" }));
    expect(screen.getByText(/Override reason/)).toBeInTheDocument();
  });
});
