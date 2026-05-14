import { apiRequest } from "./client";

export type EmailQueueRow = {
  id: string;
  operating_company_id: string;
  subject: string;
  template_key: string;
  status: string;
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
};

type QueueResponse = {
  items: EmailQueueRow[];
  next_cursor?: string | null;
};

export async function listEmailQueue(
  operatingCompanyId: string,
  opts?: { status?: string; limit?: number; cursor?: string | null }
): Promise<QueueResponse> {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId, limit: String(opts?.limit ?? 50) });
  if (opts?.status) qs.set("status", opts.status);
  if (opts?.cursor) qs.set("cursor", opts.cursor);
  return apiRequest<QueueResponse>(`/api/v1/email/queue?${qs.toString()}`);
}

export async function adminRetryEmailQueueItem(queueId: string, operatingCompanyId: string): Promise<{ row: EmailQueueRow }> {
  return apiRequest<{ row: EmailQueueRow }>(`/api/v1/admin/email-queue/${encodeURIComponent(queueId)}/retry`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}
