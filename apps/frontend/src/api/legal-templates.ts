import { apiRequest } from "./client";

export type LegalTemplateStatus = "draft" | "pending_review" | "approved" | "active" | "retired";
export type LegalTemplateLanguage = "en" | "es" | "bilingual";

export type LegalTemplateVariableSchema = {
  fields: Record<
    string,
    {
      type: "text" | "date" | "number" | "boolean";
      required: boolean;
      description?: string;
    }
  >;
};

export type LegalTemplateSummary = {
  id: string;
  template_code: string;
  version: number;
  display_name_en: string;
  display_name_es: string;
  category: string;
  requires_witness: boolean;
  status: LegalTemplateStatus;
  submitted_for_review_at: string | null;
  attorney_approved_by: string | null;
  attorney_bar_number: string | null;
  attorney_approved_at: string | null;
  activated_at: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LegalTemplateDetail = LegalTemplateSummary & {
  content_html_en: string;
  content_html_es: string;
  variable_schema: LegalTemplateVariableSchema;
  attorney_notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  versions?: Array<{
    id: string;
    template_code: string;
    version: number;
    status: LegalTemplateStatus;
    created_at: string;
    updated_at: string;
    attorney_approved_by: string | null;
    attorney_approved_at: string | null;
  }>;
  audit_log?: Array<{
    id: number;
    event_type: string;
    event_payload: Record<string, unknown>;
    actor_user_id: string | null;
    actor_name: string | null;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
  }>;
};

export type LegalTemplateDraft = {
  template_code: string;
  display_name_en: string;
  display_name_es: string;
  category: string;
  content_html_en: string;
  content_html_es: string;
  variable_schema: LegalTemplateVariableSchema;
  requires_witness: boolean;
};

export type LegalTemplateUpdate = Partial<LegalTemplateDraft>;

type ListFilters = {
  operating_company_id: string;
  category?: string;
  language?: LegalTemplateLanguage;
  status?: LegalTemplateStatus;
  search?: string;
};

function withCompany(path: string, operatingCompanyId: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
}

export const legalTemplatesApi = {
  list(filters: ListFilters) {
    const params = new URLSearchParams();
    params.set("operating_company_id", filters.operating_company_id);
    if (filters.category) params.set("category", filters.category);
    if (filters.language) params.set("language", filters.language);
    if (filters.status) params.set("status", filters.status);
    if (filters.search) params.set("search", filters.search);
    return apiRequest<{ templates: LegalTemplateSummary[] }>(`/api/v1/legal/templates?${params.toString()}`);
  },

  get(id: string, operatingCompanyId: string) {
    return apiRequest<LegalTemplateDetail>(withCompany(`/api/v1/legal/templates/${id}`, operatingCompanyId));
  },

  create(operatingCompanyId: string, body: LegalTemplateDraft) {
    return apiRequest<LegalTemplateDetail>(withCompany("/api/v1/legal/templates", operatingCompanyId), {
      method: "POST",
      body,
    });
  },

  update(id: string, operatingCompanyId: string, body: LegalTemplateUpdate) {
    return apiRequest<LegalTemplateDetail>(withCompany(`/api/v1/legal/templates/${id}`, operatingCompanyId), {
      method: "PATCH",
      body,
    });
  },

  submit(id: string, operatingCompanyId: string) {
    return apiRequest<LegalTemplateSummary>(withCompany(`/api/v1/legal/templates/${id}/submit`, operatingCompanyId), {
      method: "POST",
    });
  },

  approve(
    id: string,
    operatingCompanyId: string,
    body: { attorney_name: string; bar_number: string; notes?: string }
  ) {
    return apiRequest<LegalTemplateSummary>(withCompany(`/api/v1/legal/templates/${id}/approve`, operatingCompanyId), {
      method: "POST",
      body,
    });
  },

  activate(id: string, operatingCompanyId: string) {
    return apiRequest<LegalTemplateSummary>(withCompany(`/api/v1/legal/templates/${id}/activate`, operatingCompanyId), {
      method: "POST",
    });
  },

  retire(id: string, operatingCompanyId: string) {
    return apiRequest<LegalTemplateSummary>(withCompany(`/api/v1/legal/templates/${id}/retire`, operatingCompanyId), {
      method: "POST",
    });
  },
};
