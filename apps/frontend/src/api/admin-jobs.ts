import { apiRequest } from "./client";

export type AdminJobStatus = "queued" | "running" | "completed" | "failed";

export type AdminJobRecord = {
  jobId: string;
  operation: string;
  status: AdminJobStatus;
  enqueuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  result: unknown;
  error: string | null;
  attempts: number;
  maxAttempts: number;
  operating_company_id: string | null;
};

export async function triggerDeactivateProbeAccounts(): Promise<{ ok: boolean; jobId: string }> {
  return apiRequest<{ ok: boolean; jobId: string }>("/api/v1/admin/jobs/deactivate-probe-accounts", {
    method: "POST",
    body: {},
  });
}

export async function getAdminJob(jobId: string): Promise<AdminJobRecord> {
  return apiRequest<AdminJobRecord>(`/api/v1/admin/jobs/${jobId}`);
}
