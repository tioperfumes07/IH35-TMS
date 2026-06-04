import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as applicantsApi from "../../../api/applicants";
import { ApplicantsPipelinePage } from "../ApplicantsPipelinePage";

const companyId = "11111111-1111-4111-8111-111111111111";
const applicantId = "a1111111-1111-4111-8111-111111111111";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: companyId }),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ApplicantsPipelinePage (A24-12)", () => {
  beforeEach(() => {
    vi.spyOn(applicantsApi, "ensureApplicantPortal").mockResolvedValue({
      portal: {
        id: "p1111111-1111-4111-8111-111111111111",
        operating_company_id: companyId,
        record_kind: "portal_config",
        status: "new",
        first_name: null,
        last_name: null,
        email: null,
        phone: null,
        date_of_birth: null,
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
      apply_path: "/apply/testtoken",
    });
    vi.spyOn(applicantsApi, "listDriverApplicants").mockResolvedValue({
      applicants: [
        {
          id: applicantId,
          operating_company_id: companyId,
          record_kind: "applicant",
          status: "new",
          first_name: "Jane",
          last_name: "Doe",
          email: "jane@example.com",
          phone: "+15551234567",
          date_of_birth: "1990-01-01",
          cdl_number: "TX123",
          cdl_state: "TX",
          years_experience: 5,
          application_data: {},
          converted_driver_id: null,
          onboarding_session_id: null,
          status_notes: null,
          created_at: "2026-06-04T12:00:00Z",
          updated_at: "2026-06-04T12:00:00Z",
        },
      ],
    });
    vi.spyOn(applicantsApi, "updateApplicantStatus").mockResolvedValue({
      applicant: {
        id: applicantId,
        operating_company_id: companyId,
        record_kind: "applicant",
        status: "screening",
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@example.com",
        phone: "+15551234567",
        date_of_birth: "1990-01-01",
        cdl_number: "TX123",
        cdl_state: "TX",
        years_experience: 5,
        application_data: {},
        converted_driver_id: null,
        onboarding_session_id: null,
        status_notes: null,
        created_at: "2026-06-04T12:00:00Z",
        updated_at: "2026-06-04T12:00:00Z",
      },
    });
    vi.spyOn(applicantsApi, "convertApplicantToDriver").mockResolvedValue({
      applicant: {
        id: applicantId,
        operating_company_id: companyId,
        record_kind: "applicant",
        status: "hired",
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@example.com",
        phone: "+15551234567",
        date_of_birth: "1990-01-01",
        cdl_number: "TX123",
        cdl_state: "TX",
        years_experience: 5,
        application_data: {},
        converted_driver_id: "d1111111-1111-4111-8111-111111111111",
        onboarding_session_id: "s1111111-1111-4111-8111-111111111111",
        status_notes: null,
        created_at: "2026-06-04T12:00:00Z",
        updated_at: "2026-06-04T12:00:00Z",
      },
      driver_id: "d1111111-1111-4111-8111-111111111111",
      onboarding_session_id: "s1111111-1111-4111-8111-111111111111",
      onboarding_path: "/drivers/onboarding/s1111111-1111-4111-8111-111111111111",
    });
  });

  it("renders applicant pipeline board at /drivers/applicants", async () => {
    render(wrap(<ApplicantsPipelinePage />));
    expect(await screen.findByTestId("applicants-pipeline-page")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-column-new")).toBeInTheDocument();
    expect(await screen.findByTestId(`applicant-card-${applicantId}`)).toBeInTheDocument();
  });

  it("shows public apply link from ensure-portal API", async () => {
    render(wrap(<ApplicantsPipelinePage />));
    await screen.findByTestId("applicant-public-link");
    expect(screen.getByText(/\/apply\/testtoken/)).toBeInTheDocument();
  });

  it("moves applicant to screening status", async () => {
    render(wrap(<ApplicantsPipelinePage />));
    await screen.findByTestId(`applicant-card-${applicantId}`);
    await userEvent.click(screen.getByRole("button", { name: /→ Screening/i }));
    await waitFor(() => {
      expect(applicantsApi.updateApplicantStatus).toHaveBeenCalledWith(applicantId, companyId, { status: "screening" });
    });
  });

  it("convert to driver calls convert API", async () => {
    render(wrap(<ApplicantsPipelinePage />));
    await screen.findByTestId(`convert-applicant-${applicantId}`);
    await userEvent.click(screen.getByTestId(`convert-applicant-${applicantId}`));
    await waitFor(() => {
      expect(applicantsApi.convertApplicantToDriver).toHaveBeenCalledWith(applicantId, companyId);
    });
  });
});
