import { apiRequest } from "./client";

export type ApplicantStatus = "new" | "screening" | "interview" | "offer" | "hired" | "declined" | "withdrawn";

export type DriverApplicant = {
  id: string;
  operating_company_id: string;
  record_kind: "portal_config" | "applicant";
  status: ApplicantStatus;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  cdl_number: string | null;
  cdl_state: string | null;
  years_experience: number | null;
  application_data: Record<string, unknown>;
  converted_driver_id: string | null;
  onboarding_session_id: string | null;
  status_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicApplyPortal = {
  company_name: string;
  operating_company_id: string;
  compliance: {
    minimum_age: number;
    fcra_disclosure_required: boolean;
    fcra_notice: string;
  };
};

export function getPublicApplyPortal(token: string) {
  return apiRequest<PublicApplyPortal>(`/api/v1/public/apply/${encodeURIComponent(token)}`);
}

export function submitDriverApplication(
  token: string,
  body: {
    first_name: string;
    last_name: string;
    phone: string;
    email?: string | null;
    date_of_birth: string;
    cdl_number?: string | null;
    cdl_state?: string | null;
    years_experience?: number | null;
    fcra_consent: true;
  }
) {
  return apiRequest<{ applicant: DriverApplicant }>(`/api/v1/public/apply/${encodeURIComponent(token)}`, {
    method: "POST",
    body,
  });
}

export function ensureApplicantPortal(operatingCompanyId: string) {
  return apiRequest<{ portal: DriverApplicant; apply_path: string }>("/api/v1/identity/applicants/ensure-portal", {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}

export function listDriverApplicants(operatingCompanyId: string) {
  return apiRequest<{ applicants: DriverApplicant[] }>(
    `/api/v1/identity/applicants?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function updateApplicantStatus(
  applicantId: string,
  operatingCompanyId: string,
  body: { status: ApplicantStatus; status_notes?: string | null }
) {
  return apiRequest<{ applicant: DriverApplicant }>(
    `/api/v1/identity/applicants/${applicantId}/status?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "PATCH", body }
  );
}

export function convertApplicantToDriver(applicantId: string, operatingCompanyId: string) {
  return apiRequest<{
    applicant: DriverApplicant;
    driver_id: string;
    onboarding_session_id: string;
    onboarding_path: string;
  }>(
    `/api/v1/identity/applicants/${applicantId}/convert-to-driver?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST" }
  );
}

export const APPLICANT_PIPELINE_COLUMNS: { key: ApplicantStatus; label: string }[] = [
  { key: "new", label: "New" },
  { key: "screening", label: "Screening" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
  { key: "hired", label: "Hired" },
];
