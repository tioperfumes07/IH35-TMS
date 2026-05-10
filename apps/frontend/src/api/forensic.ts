import { apiRequest } from "./client";

export type ForensicBatch = {
  id: string;
  operating_company_id: string;
  qbo_realm_id: string;
  started_at: string;
  completed_at: string | null;
  last_heartbeat_at: string | null;
  entities_imported: number;
  transactions_imported: number;
  attachments_imported: number;
  errors_count: number;
  status: "in_progress" | "completed" | "failed" | "partial" | "paused";
};

export type ForensicAnomaly = {
  id: string;
  operating_company_id: string;
  txn_snapshot_id: string | null;
  anomaly_type: string;
  severity: "review" | "suspicious" | "critical";
  review_status: "pending" | "cleared" | "confirmed_issue" | "requires_legal" | null;
  review_notes: string | null;
  detected_at: string;
  txn_date?: string | null;
  qbo_txn_type?: string | null;
  qbo_txn_id?: string | null;
  total_cents?: number | null;
  forensic_flags?: string[] | null;
};

export type QboConnectionStatus = {
  connected: boolean;
  realm_id: string | null;
  refresh_token_expires_at: string | null;
  last_used_at: string | null;
  last_refreshed_at: string | null;
  connection_id: string | null;
};

export function startForensicImport(operatingCompanyId: string, sinceDate = "2015-01-01") {
  return apiRequest<{ batch_id: string }>("/api/v1/admin/qbo-forensic/start-import", {
    method: "POST",
    body: {
      operating_company_id: operatingCompanyId,
      since_date: sinceDate,
    },
  });
}

export function listForensicBatches() {
  return apiRequest<{ batches: ForensicBatch[] }>("/api/v1/admin/qbo-forensic/batches");
}

export function getForensicBatch(batchId: string) {
  return apiRequest<ForensicBatch>(`/api/v1/admin/qbo-forensic/batch/${batchId}`);
}

export function generateForensicReport(batchId: string) {
  return apiRequest<{ r2_url: string; filename: string }>(`/api/v1/admin/qbo-forensic/batch/${batchId}/generate-report`, {
    method: "POST",
  });
}

export function listForensicAnomalies() {
  return apiRequest<{ anomalies: ForensicAnomaly[] }>("/api/v1/admin/qbo-forensic/anomalies");
}

export function reviewForensicAnomaly(
  id: string,
  payload: { review_status: "pending" | "cleared" | "confirmed_issue" | "requires_legal"; review_notes?: string }
) {
  return apiRequest<{ ok: true; id: string }>(`/api/v1/admin/qbo-forensic/anomaly/${id}/review`, {
    method: "POST",
    body: payload,
  });
}

export function getQboConnectionStatus(operatingCompanyId: string) {
  return apiRequest<QboConnectionStatus>(`/api/v1/integrations/qbo/status?operating_company_id=${encodeURIComponent(operatingCompanyId)}`);
}

export function disconnectQboConnection(operatingCompanyId: string) {
  return apiRequest<{ ok: true }>(`/api/v1/integrations/qbo/disconnect/${encodeURIComponent(operatingCompanyId)}`, {
    method: "POST",
  });
}

function getApiBaseUrl() {
  const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window === "undefined") return "";
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:3000";
  const apiHostname = hostname.replace(/^app\./, "api.");
  return `${window.location.protocol}//${apiHostname}`;
}

export function getQboAuthorizeStartUrl(operatingCompanyId: string) {
  const base = getApiBaseUrl();
  return `${base}/api/v1/integrations/qbo/oauth-start?operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
}

