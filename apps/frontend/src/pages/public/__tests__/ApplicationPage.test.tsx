import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as applicantsApi from "../../../api/applicants";
import { ApplicationPage } from "../ApplicationPage";

const token = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/apply/${token}`]}>
        <Routes>
          <Route path="/apply/:token" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ApplicationPage (A24-12)", () => {
  beforeEach(() => {
    vi.spyOn(applicantsApi, "getPublicApplyPortal").mockResolvedValue({
      company_name: "IH 35 Transport",
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      compliance: {
        minimum_age: 21,
        fcra_disclosure_required: true,
        fcra_notice: "FCRA background screening authorization required.",
      },
    });
    vi.spyOn(applicantsApi, "submitDriverApplication").mockResolvedValue({
      applicant: {
        id: "a1111111-1111-4111-8111-111111111111",
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        record_kind: "applicant",
        status: "new",
        first_name: "Jane",
        last_name: "Doe",
        email: null,
        phone: "+15551234567",
        date_of_birth: "1990-01-01",
        cdl_number: null,
        cdl_state: null,
        years_experience: null,
        application_data: {},
        converted_driver_id: null,
        onboarding_session_id: null,
        status_notes: null,
        created_at: "2026-06-04T12:00:00Z",
        updated_at: "2026-06-04T12:00:00Z",
      },
    });
  });

  it("renders public application form at /apply/:token", async () => {
    render(wrap(<ApplicationPage />));
    expect(await screen.findByText("Driver application")).toBeInTheDocument();
    expect(screen.getByTestId("application-fcra-notice")).toBeInTheDocument();
  });

  it("loads portal metadata via public apply API", async () => {
    render(wrap(<ApplicationPage />));
    await screen.findByText("Driver application");
    await waitFor(() => {
      expect(applicantsApi.getPublicApplyPortal).toHaveBeenCalledWith(token);
    });
  });

  it("requires FCRA consent before submit", async () => {
    render(wrap(<ApplicationPage />));
    await screen.findByTestId("application-first-name");
    await userEvent.type(screen.getByTestId("application-first-name"), "Jane");
    await userEvent.type(screen.getByTestId("application-last-name"), "Doe");
    await userEvent.type(screen.getByTestId("application-phone"), "+15551234567");
    await userEvent.click(screen.getByTestId("application-submit"));
    expect(applicantsApi.submitDriverApplication).not.toHaveBeenCalled();
  });

  it("submits application when form is valid", async () => {
    render(wrap(<ApplicationPage />));
    await screen.findByTestId("application-first-name");
    await userEvent.type(screen.getByTestId("application-first-name"), "Jane");
    await userEvent.type(screen.getByTestId("application-last-name"), "Doe");
    await userEvent.type(screen.getByTestId("application-phone"), "+15551234567");
    await userEvent.click(screen.getByTestId("application-fcra-consent"));
    await userEvent.click(screen.getByTestId("application-submit"));
    await waitFor(() => {
      expect(applicantsApi.submitDriverApplication).toHaveBeenCalled();
    });
    expect(await screen.findByText(/application received/i)).toBeInTheDocument();
  });
});
