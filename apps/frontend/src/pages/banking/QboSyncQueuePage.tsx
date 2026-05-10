import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getQboSyncQueue,
  getQboSyncQueueStats,
  retryQboSyncQueueItem,
  skipQboSyncQueueItem,
  type QboSyncQueueItem,
} from "../../api/banking";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";

export function QboSyncQueuePage() {
  const auth = useAuth();
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const companyId = selectedCompanyId ?? "";
  const isOwner = auth.user?.role === "Owner";

  const statsQuery = useQuery({
    queryKey: ["qbo-sync", "stats", companyId],
    queryFn: () => getQboSyncQueueStats(companyId),
    enabled: Boolean(companyId),
  });
  const queueQuery = useQuery({
    queryKey: ["qbo-sync", "queue", companyId],
    queryFn: () => getQboSyncQueue(companyId, { limit: 100 }),
    enabled: Boolean(companyId),
  });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["qbo-sync", "stats", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["qbo-sync", "queue", companyId] }),
      queryClient.invalidateQueries({ queryKey: ["banking", "qbo-sync-stats", companyId] }),
    ]);

  async function retryItem(item: QboSyncQueueItem) {
    setProcessingId(item.id);
    try {
      await retryQboSyncQueueItem(item.id, companyId);
      pushToast("Queue item moved back to pending", "success");
      await refresh();
    } catch (error) {
      pushToast(String((error as Error)?.message ?? "Retry failed"), "error");
    } finally {
      setProcessingId(null);
    }
  }

  async function skipItem(item: QboSyncQueueItem) {
    if (!isOwner) return;
    setProcessingId(item.id);
    try {
      await skipQboSyncQueueItem(item.id, companyId, "Skipped by owner from admin queue");
      pushToast("Queue item marked blocked", "success");
      await refresh();
    } catch (error) {
      pushToast(String((error as Error)?.message ?? "Skip failed"), "error");
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader title="QBO Sync Queue" subtitle="Review pending/failed/blocked banking sync jobs" />
      {statsQuery.isError || queueQuery.isError ? <ListErrorBanner onRetry={() => void refresh()} /> : null}
      <div className="rounded border border-gray-200 bg-white p-3 text-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <p>Pending: {Number(statsQuery.data?.pending ?? 0)}</p>
          <p>In-flight: {Number(statsQuery.data?.in_flight ?? 0)}</p>
          <p>Synced: {Number(statsQuery.data?.synced ?? 0)}</p>
          <p>Failed: {Number(statsQuery.data?.failed ?? 0)}</p>
          <p>Blocked: {Number(statsQuery.data?.blocked ?? 0)}</p>
          <p>
            Last success:{" "}
            {statsQuery.data?.last_successful_sync_at ? new Date(statsQuery.data.last_successful_sync_at).toLocaleString() : "Never"}
          </p>
        </div>
      </div>
      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Queue Items</div>
        <div className="space-y-2">
          {(queueQuery.data?.items ?? []).map((item) => (
            <div key={item.id} className="rounded border border-gray-100 p-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="font-semibold text-gray-900">
                    {item.entity_type} - {item.entity_id}
                  </p>
                  <p className="text-gray-600">
                    status={item.sync_status} attempts={item.attempt_count}/{item.max_attempts}
                  </p>
                  <p className="text-gray-500">next attempt: {new Date(item.next_attempt_at).toLocaleString()}</p>
                  {item.error_message ? <p className="text-red-600">{item.error_message}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  {(item.sync_status === "failed" || item.sync_status === "blocked") && (
                    <ActionButton disabled={processingId === item.id} onClick={() => void retryItem(item)}>
                      Retry
                    </ActionButton>
                  )}
                  {isOwner && item.sync_status !== "synced" ? (
                    <ActionButton disabled={processingId === item.id} onClick={() => void skipItem(item)}>
                      Skip
                    </ActionButton>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          {(queueQuery.data?.items ?? []).length === 0 && !queueQuery.isLoading ? (
            <p className="text-sm text-gray-500">No queue items found for this company.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

