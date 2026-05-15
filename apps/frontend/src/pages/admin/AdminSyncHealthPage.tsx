import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAdminSyncHealth, postAdminSyncResetRealm } from "../../api/admin-sync";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";

export function AdminSyncHealthPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["admin", "sync-health", companyId],
    queryFn: () => getAdminSyncHealth(companyId),
    enabled: Boolean(companyId),
  });

  const resetMut = useMutation({
    mutationFn: () => postAdminSyncResetRealm({ operating_company_id: companyId, confirm: true }),
    onSuccess: () => {
      pushToast("Reset realm issued", "success");
      void qc.invalidateQueries({ queryKey: ["admin", "sync-health"] });
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Failed"), "error"),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sync health"
        subtitle="Outbound queue + inbound QuickBooks connectivity (Owner)."
        actions={
          <ActionButton
            type="button"
            className="border border-red-200 bg-red-50 text-red-900"
            aria-label="Reset realm sync queue"
            disabled={!companyId || resetMut.isPending}
            onClick={() => {
              if (!window.confirm("Dead-letter pending outbound jobs for this company?")) return;
              void resetMut.mutateAsync();
            }}
          >
            Reset realm
          </ActionButton>
        }
      />
      {!companyId ? <p className="text-sm text-amber-800">Select an operating company.</p> : null}
      {q.isError ? <ListErrorBanner onRetry={() => void q.refetch()} /> : null}
      <pre className="max-h-[32rem] overflow-auto rounded border bg-gray-50 p-3 text-xs">{JSON.stringify(q.data ?? {}, null, 2)}</pre>
    </div>
  );
}
