import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminRetryEmailQueueItem, listEmailQueue, type EmailQueueRow } from "../../api/email-queue";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";

export function EmailQueuePage() {
  const auth = useAuth();
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const [processingId, setProcessingId] = useState<string | null>(null);
  const privileged = auth.user?.role === "Owner" || auth.user?.role === "Administrator";

  const queueQuery = useQuery({
    queryKey: ["email-queue", companyId],
    queryFn: () => listEmailQueue(companyId, { limit: 100 }),
    enabled: Boolean(companyId && privileged),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["email-queue", companyId] });

  async function retry(row: EmailQueueRow) {
    setProcessingId(row.id);
    try {
      await adminRetryEmailQueueItem(row.id, companyId);
      pushToast("Email queued for retry", "success");
      await refresh();
    } catch (error) {
      pushToast(String((error as Error)?.message ?? "Retry failed"), "error");
    } finally {
      setProcessingId(null);
    }
  }

  if (!privileged) {
    return (
      <div className="space-y-3">
        <PageHeader title="Email Queue" subtitle="Owner/Administrator only" />
        <p className="text-sm text-gray-600">You need Owner or Administrator access to view outbound email jobs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageHeader title="Email Queue" subtitle="Retry failed deliveries without SQL" />
      {queueQuery.isError ? <ListErrorBanner onRetry={() => void refresh()} /> : null}
      <div className="rounded border border-gray-200 bg-white p-3 text-xs text-gray-700">
        <p>
          Queue listings load from <span className="font-mono text-[11px]">GET /api/v1/email/queue</span> (pass{" "}
          <span className="font-mono text-[11px]">operating_company_id</span>). Failed sends can be re-queued via{" "}
          <span className="font-mono text-[11px]">POST /api/v1/admin/email-queue/:id/retry</span>.
        </p>
      </div>
      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recent jobs</div>
          <ActionButton onClick={() => void refresh()}>Refresh</ActionButton>
        </div>
        <div className="space-y-2">
          {(queueQuery.data?.items ?? []).map((item) => (
            <div key={item.id} className="rounded border border-gray-100 p-2 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="font-semibold text-gray-900">{item.subject}</p>
                  <p className="text-gray-600">
                    template=<span className="font-mono">{item.template_key}</span> · status=
                    <span className="font-mono">{item.status}</span>
                  </p>
                  <p className="font-mono text-[11px] text-gray-500">{item.id}</p>
                  {item.error_message ? <p className="text-red-600">{item.error_message}</p> : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {item.status === "failed" ? (
                    <ActionButton disabled={processingId === item.id} onClick={() => void retry(item)}>
                      {processingId === item.id ? "Retrying…" : "Retry send"}
                    </ActionButton>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          {(queueQuery.data?.items ?? []).length === 0 && !queueQuery.isLoading ? (
            <p className="text-sm text-gray-500">No email queue rows returned for this company.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
