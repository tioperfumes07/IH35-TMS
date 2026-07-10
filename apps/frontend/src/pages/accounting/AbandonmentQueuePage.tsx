import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { approveAbandonmentChargeback, listAbandonmentChargebacks, type AbandonmentChargebackRow } from "../../api/abandonment";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { EntityLink } from "../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

export function AbandonmentQueuePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"pending" | "all">("pending");

  const listQuery = useQuery({
    queryKey: ["abandonment-chargebacks", companyId, status],
    queryFn: () => listAbandonmentChargebacks({ operating_company_id: companyId, status }),
    enabled: Boolean(companyId),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => approveAbandonmentChargeback(id, { operating_company_id: companyId }),
    onSuccess: () => {
      pushToast("Chargeback approved", "success");
      void queryClient.invalidateQueries({ queryKey: ["abandonment-chargebacks"] });
    },
    onError: (e: unknown) => pushToast(String((e as Error)?.message ?? "Approve failed"), "error"),
  });

  const rows = listQuery.data?.abandonment_chargebacks ?? [];

  const subtitle = useMemo(() => "Office queue for abandonment chargebacks (pending approvals).", []);

  const columns = useMemo<ParityColumn<AbandonmentChargebackRow>[]>(
    () => [
      {
        key: "load_id",
        label: "Load",
        render: (row) => {
          const loadId = String(row.load_id ?? "");
          return <EntityLink kind="load" id={row.load_id as string | undefined} label={loadId ? `${loadId.slice(0, 8)}…` : undefined} />;
        },
      },
      {
        key: "driver_id",
        label: "Driver",
        render: (row) => {
          const driverId = String(row.driver_id ?? "");
          return <EntityLink kind="driver" id={row.driver_id as string | undefined} label={driverId ? `${driverId.slice(0, 8)}…` : undefined} />;
        },
      },
      { key: "total_chargeback_cents", label: "Total ¢", render: (row) => String(row.total_chargeback_cents ?? "") },
      { key: "status", label: "Status", render: (row) => <span className="capitalize">{String(row.status ?? "")}</span> },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => {
          const id = String(row.id ?? "");
          const st = String(row.status ?? "");
          return st === "pending" ? (
            <Button type="button" size="sm" onClick={() => void approveMut.mutateAsync(id)} disabled={approveMut.isPending}>
              Approve
            </Button>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          );
        },
      },
    ],
    [approveMut],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-3 px-3 py-3">
      <PageHeader title="Abandonment chargebacks" subtitle={subtitle} />

      {!companyId ? <div className="rounded-sm border border-slate-200 bg-slate-50 p-3 text-sm">Select a company.</div> : null}

      {!listQuery.isLoading && listQuery.isError ? (
        <ListErrorState
          title="Couldn't load abandonment queue"
          status={0}
          message={(listQuery.error as Error | undefined)?.message}
          onRetry={() => void listQuery.refetch()}
        />
      ) : null}

      <ParityTable
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.id ?? "")}
        loading={listQuery.isPending || (listQuery.isFetching && rows.length === 0)}
        filterBar={
          <SelectCombobox className="h-9 rounded-sm border border-gray-300 px-2 text-xs" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="pending">Pending</option>
            <option value="all">All</option>
          </SelectCombobox>
        }
        storageKey="abandonment-queue"
        emptyText="No rows."
      />
    </div>
  );
}
