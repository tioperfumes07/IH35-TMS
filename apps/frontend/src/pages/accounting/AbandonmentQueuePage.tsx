import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { approveAbandonmentChargeback, listAbandonmentChargebacks, type AbandonmentChargebackRow } from "../../api/abandonment";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { userFacingApiError } from "../../lib/api-error-message";

export function AbandonmentQueuePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"pending" | "all">("pending");
  const staged = useStagedListFilters({ applied: { status }, empty: { status: "pending" as const }, onApply: (next) => setStatus(next.status) });

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
    onError: (e: unknown) => pushToast(userFacingApiError(e, "Could not approve chargeback"), "error"),
  });

  const rows = listQuery.data?.abandonment_chargebacks ?? [];

  const subtitle = useMemo(() => "Office queue for abandonment chargebacks (pending approvals).", []);

  const columns = useMemo<ParityColumn<AbandonmentChargebackRow>[]>(
    () => [
      {
        key: "load_id",
        label: "Load",
        render: (row) => {
          return <EntityLinkOrTombstone kind="load" id={row.load_id} name={row.load_number} noun="Load" />;
        },
      },
      {
        key: "driver_id",
        label: "Driver",
        render: (row) => {
          return <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" />;
        },
      },
      {
        key: "applied_to_settlement_id",
        label: "Settlement",
        render: (row) => {
          return <EntityLinkOrTombstone kind="settlement" id={row.applied_to_settlement_id} name={row.settlement_display_id} noun="Settlement" />;
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
          <CollapsedListFilters
            activeFilterCount={status !== "pending" ? 1 : 0}
            onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}
            testIdPrefix="abandonment"
            dataAttributes={{ "data-abandonment-filter-toolbar": "collapsed" }}
          >
            <SelectCombobox className="h-9 rounded-sm border border-gray-300 px-2 text-xs" value={staged.draft.status} onChange={(e) => staged.setDraft({ status: e.target.value as typeof status })}>
              <option value="pending">Pending</option>
              <option value="all">All</option>
            </SelectCombobox>
          </CollapsedListFilters>
        }
        storageKey="abandonment-queue"
        emptyText="No rows."
      />
    </div>
  );
}
