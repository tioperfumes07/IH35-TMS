import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiRequest } from "../../api/client";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { formatUsd } from "../../lib/money";

type UnitTollTag = {
  uuid: string;
  tag_network: string;
  tag_number: string;
  activated_at: string;
  deactivated_at: string | null;
  monthly_fee: string | null;
  balance_current: string | null;
  auto_replenish: boolean;
};

type TollTagsResponse = {
  toll_tags: UnitTollTag[];
  low_balance_tags: UnitTollTag[];
};

type UnitTollTagsTabProps = {
  unitId: string;
  companyId: string;
};

function fetchTollTags(unitId: string, companyId: string) {
  return apiRequest<TollTagsResponse>(
    `/api/units/${unitId}/toll-tags?operating_company_id=${encodeURIComponent(companyId)}`
  );
}

function formatMoney(value: string | null) {
  if (value == null || value === "") return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return formatUsd(num);
}

export function UnitTollTagsTab({ unitId, companyId }: UnitTollTagsTabProps) {
  const tagsQuery = useQuery({
    queryKey: ["unit-toll-tags", unitId, companyId],
    queryFn: () => fetchTollTags(unitId, companyId),
    enabled: Boolean(unitId && companyId),
  });

  const lowBalanceIds = useMemo(
    () => new Set((tagsQuery.data?.low_balance_tags ?? []).map((tag) => tag.uuid)),
    [tagsQuery.data?.low_balance_tags]
  );

  const columns = useMemo<Array<ParityColumn<UnitTollTag>>>(
    () => [
      {
        key: "tag_network",
        label: "Network",
        sortable: true,
        sortValue: (row) => row.tag_network,
        render: (row) => <span className="font-medium uppercase text-gray-900">{row.tag_network}</span>,
      },
      {
        key: "tag_number",
        label: "Tag #",
        sortable: true,
        sortValue: (row) => row.tag_number,
      },
      {
        key: "activated_at",
        label: "Activated",
        sortable: true,
        sortValue: (row) => row.activated_at,
      },
      {
        key: "balance_current",
        label: "Balance",
        sortable: true,
        sortValue: (row) => Number(row.balance_current ?? NaN),
        render: (row) => (
          <>
            <span className={lowBalanceIds.has(row.uuid) ? "font-semibold text-amber-700" : ""}>
              {formatMoney(row.balance_current)}
            </span>
            {lowBalanceIds.has(row.uuid) ? (
              <span className="ml-1 rounded-sm bg-amber-100 px-1 py-0.5 text-xs font-semibold text-amber-800">
                Low
              </span>
            ) : null}
          </>
        ),
      },
      {
        key: "monthly_fee",
        label: "Monthly",
        sortable: true,
        sortValue: (row) => Number(row.monthly_fee ?? NaN),
        render: (row) => formatMoney(row.monthly_fee),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        sortValue: (row) => (row.deactivated_at ? "Deactivated" : "Active"),
        render: (row) => (row.deactivated_at ? "Deactivated" : "Active"),
      },
    ],
    [lowBalanceIds]
  );

  const rows = tagsQuery.data?.toll_tags ?? [];

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="unit-toll-tags-tab">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Toll Tags</h3>
        <span className="text-xs text-gray-500">TxTAG · EZ-Pass · I-Pass</span>
      </div>
      {tagsQuery.isError ? (
        <div className="mt-2" data-testid="unit-toll-tags-error">
          <ListErrorState
            title="Couldn't load toll tags"
            status={(tagsQuery.error as { status?: number })?.status ?? 0}
            message={(tagsQuery.error as Error)?.message}
            onRetry={() => void tagsQuery.refetch()}
          />
        </div>
      ) : (
        <div className="mt-2">
          <ParityTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.uuid}
            loading={tagsQuery.isLoading}
            storageKey="unit-toll-tags"
            tableTestId="unit-toll-tags-table"
            rowTestId={(row) => `unit-toll-tags-row-${row.uuid}`}
            emptyText="No toll tags assigned to this unit."
            exportFilename="unit-toll-tags"
          />
        </div>
      )}
    </section>
  );
}
