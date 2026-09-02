import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { listAllLoads, type DispatchLoadRow } from "../../api/loads";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { entityLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

type CostAggregate = {
  load_id: string;
  expense_cents: string;
  bill_cents: string;
  expense_count: number;
  bill_count: number;
  unpaid_bill_count: number;
};

type BoardRow = CostAggregate & { load: DispatchLoadRow };
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const formatMoney = (cents: number) => money.format(cents / 100);

export function LoadCostsBoardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const query = useQuery({
    queryKey: ["accounting", "load-costs-board", companyId],
    queryFn: async () => {
      const [loads, costs] = await Promise.all([
        listAllLoads({ operating_company_id: [companyId], sort: "created_at:desc" }),
        apiRequest<{ rows: CostAggregate[] }>(`/api/v1/accounting/load-costs-board?operating_company_id=${encodeURIComponent(companyId)}`),
      ]);
      return { loads: loads.loads, costs: costs.rows };
    },
    enabled: Boolean(companyId),
    retry: false,
  });

  const rows = useMemo<BoardRow[]>(() => {
    const costs = new Map((query.data?.costs ?? []).map((row) => [row.load_id, row]));
    return (query.data?.loads ?? []).map((load) => ({
      load,
      load_id: load.id,
      expense_cents: costs.get(load.id)?.expense_cents ?? "0",
      bill_cents: costs.get(load.id)?.bill_cents ?? "0",
      expense_count: costs.get(load.id)?.expense_count ?? 0,
      bill_count: costs.get(load.id)?.bill_count ?? 0,
      unpaid_bill_count: costs.get(load.id)?.unpaid_bill_count ?? 0,
    }));
  }, [query.data]);

  const columns = useMemo<Array<ParityColumn<BoardRow>>>(() => [
    { key: "load", label: "Load #", sortable: true, sortValue: (row) => row.load.load_number, render: (row) => <Link className="font-semibold text-slate-700 underline" to={`/dispatch/loads/${encodeURIComponent(row.load.id)}?tab=Costs`}>{row.load.load_number}</Link> },
    { key: "customer", label: "Customer", sortable: true, sortValue: (row) => row.load.customer_name ?? "", render: (row) => <EntityLink kind="customer" id={row.load.customer_id} label={entityLabel(row.load.customer_name, row.load.customer_id, "Customer")} /> },
    { key: "booked", label: "Booked", sortable: true, sortValue: (row) => row.load.created_at, render: (row) => formatDateUS(row.load.created_at) },
    { key: "paid", label: "Paid now", sortable: true, sortValue: (row) => Number(row.expense_cents), cellClass: "text-right", render: (row) => formatMoney(Number(row.expense_cents)) },
    { key: "owed", label: "Owed / A/P", sortable: true, sortValue: (row) => Number(row.bill_cents), cellClass: "text-right", render: (row) => formatMoney(Number(row.bill_cents)) },
    { key: "costs", label: "Costs", sortable: true, sortValue: (row) => Number(row.expense_cents) + Number(row.bill_cents), cellClass: "text-right", render: (row) => formatMoney(Number(row.expense_cents) + Number(row.bill_cents)) },
    { key: "margin", label: "Approx margin", sortable: true, sortValue: (row) => row.load.rate_total_cents - Number(row.expense_cents) - Number(row.bill_cents), cellClass: "text-right", render: (row) => formatMoney(row.load.rate_total_cents - Number(row.expense_cents) - Number(row.bill_cents)) },
    { key: "unpaid", label: "Unpaid bills", sortable: true, sortValue: (row) => row.unpaid_bill_count, cellClass: "text-center", render: (row) => row.unpaid_bill_count },
    { key: "driver", label: "Driver", sortable: true, sortValue: (row) => row.load.assigned_primary_driver_name ?? "", render: (row) => row.load.assigned_primary_driver_id ? <EntityLink kind="driver" id={row.load.assigned_primary_driver_id} label={entityLabel(row.load.assigned_primary_driver_name, row.load.assigned_primary_driver_id, "Driver")} /> : "Not assigned" },
    { key: "truck", label: "Truck", sortable: true, sortValue: (row) => row.load.assigned_unit_number ?? "", render: (row) => row.load.assigned_unit_id ? <EntityLink kind="unit" id={row.load.assigned_unit_id} label={entityLabel(row.load.assigned_unit_number, row.load.assigned_unit_id, "Truck")} /> : "Not assigned" },
  ], []);

  return (
    <AccountingSubNavWrapper title="Load costs" subtitle="Paid-now expenses and owed vendor bills grouped by load.">
      {query.isError ? <ListErrorState title="Could not load the costs board." status={(query.error as { status?: number })?.status ?? 0} onRetry={() => void query.refetch()} /> : null}
      {query.isLoading ? <div className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading load costs…</div> : null}
      {!query.isLoading && !query.isError ? <ParityTable columns={columns} rows={rows} rowKey={(row) => row.load.id} emptyText="No loads found for this company." storageKey="accounting-load-costs" initialPageSize={25} pageSizeOptions={[25, 50, 100]} exportFilename="load-costs" tableTestId="accounting-load-costs-board" /> : null}
    </AccountingSubNavWrapper>
  );
}
