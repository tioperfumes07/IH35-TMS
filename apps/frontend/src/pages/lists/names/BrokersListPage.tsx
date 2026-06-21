import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listCustomers } from "../../../api/mdata";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../../contexts/CompanyContext";

function statusPillClass(status: string) {
  return status === "active"
    ? "rounded bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700"
    : "rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600";
}

export function BrokersListPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["names", "brokers", companyId, search],
    queryFn: () =>
      listCustomers({
        operating_company_id: companyId,
        customer_type: "broker",
        search: search || undefined,
        status: "active",
      }),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.customers ?? [];

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Names master", "Brokers"]}
        title="Brokers"
        countBadge={rows.length}
      />
      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

      <div className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-600">
        Brokers are customers with the <strong>Broker</strong> type — a role on the customer record, not a
        separate master. This is a filtered directory; create or edit a broker from its customer record.
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, code, MC# or DOT#"
          className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">MC #</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={5}>
                  Loading brokers...
                </td>
              </tr>
            ) : null}
            {!query.isLoading && rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={5}>
                  No brokers found. Set a customer's type to “Broker” to list it here.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                onClick={() => navigate(`/customers/${row.id}`)}
              >
                <td className="px-3 py-2 font-medium text-slate-800">{row.name}</td>
                <td className="px-3 py-2 text-xs tracking-normal [font-variant-ligatures:none]">{row.customer_code ?? "—"}</td>
                <td className="px-3 py-2">{row.mc_number ?? "—"}</td>
                <td className="px-3 py-2 text-slate-600">{row.email ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className={statusPillClass(row.status)}>{row.status === "active" ? "Active" : row.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500">Total brokers: {rows.length}</div>
    </div>
  );
}
