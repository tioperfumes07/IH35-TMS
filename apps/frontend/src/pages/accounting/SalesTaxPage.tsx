import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSalesTaxAgency,
  fileSalesTaxReturn,
  listSalesTaxAgencies,
  listSalesTaxReturns,
  markSalesTaxReturnPaid,
  prepareSalesTaxReturn,
} from "../../api/accounting";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function SalesTaxPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [agencyName, setAgencyName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [selectedAgencyId, setSelectedAgencyId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const agenciesQuery = useQuery({
    queryKey: ["sales-tax", "agencies", companyId],
    queryFn: () => listSalesTaxAgencies(companyId),
    enabled: Boolean(companyId),
  });

  const returnsQuery = useQuery({
    queryKey: ["sales-tax", "returns", companyId],
    queryFn: () => listSalesTaxReturns(companyId, { limit: 100 }),
    enabled: Boolean(companyId),
  });

  const createAgencyMutation = useMutation({
    mutationFn: async () =>
      createSalesTaxAgency({
        operating_company_id: companyId,
        name: agencyName,
        jurisdiction: jurisdiction || undefined,
      }),
    onSuccess: async () => {
      setAgencyName("");
      setJurisdiction("");
      await queryClient.invalidateQueries({ queryKey: ["sales-tax", "agencies", companyId] });
      pushToast("Sales tax agency created", "success");
    },
    onError: (error) => pushToast(String((error as Error).message ?? "Failed to create agency"), "error"),
  });

  const prepareReturnMutation = useMutation({
    mutationFn: async () =>
      prepareSalesTaxReturn({
        operating_company_id: companyId,
        agency_id: selectedAgencyId,
        period_start: periodStart,
        period_end: periodEnd,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sales-tax", "returns", companyId] });
      pushToast("Sales tax return prepared", "success");
    },
    onError: (error) => pushToast(String((error as Error).message ?? "Failed to prepare return"), "error"),
  });

  const totals = useMemo(() => {
    const rows = returnsQuery.data?.returns ?? [];
    return rows.reduce(
      (acc, row) => ({
        taxable: acc.taxable + Number(row.taxable_sales_cents ?? 0),
        collected: acc.collected + Number(row.tax_collected_cents ?? 0),
        owed: acc.owed + Number(row.tax_owed_cents ?? 0),
      }),
      { taxable: 0, collected: 0, owed: 0 }
    );
  }, [returnsQuery.data?.returns]);

  return (
    <AccountingSubNavWrapper title="Sales tax handling" subtitle="Manage sales tax agencies, prepare returns, and track filed/paid states.">

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-xs text-gray-500">Taxable sales</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">{money(totals.taxable)}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-xs text-gray-500">Tax collected</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">{money(totals.collected)}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-xs text-gray-500">Tax owed</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">{money(totals.owed)}</div>
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-2 text-sm font-semibold text-gray-900">Create agency</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            value={agencyName}
            onChange={(event) => setAgencyName(event.target.value)}
            placeholder="Agency name"
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <input
            value={jurisdiction}
            onChange={(event) => setJurisdiction(event.target.value)}
            placeholder="Jurisdiction (optional)"
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <div className="text-xs text-gray-500 md:col-span-1 md:flex md:items-center">Agency links to vendor optional (API supports it).</div>
          <Button
            disabled={!companyId || !agencyName.trim()}
            loading={createAgencyMutation.isPending}
            onClick={() => createAgencyMutation.mutate()}
          >
            Add agency
          </Button>
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-2 text-sm font-semibold text-gray-900">Prepare return</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <select
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            value={selectedAgencyId}
            onChange={(event) => setSelectedAgencyId(event.target.value)}
          >
            <option value="">Select agency</option>
            {(agenciesQuery.data?.agencies ?? []).map((agency) => (
              <option key={agency.id} value={agency.id}>
                {agency.name}
              </option>
            ))}
          </select>
          <DatePicker value={periodStart} onChange={(next) => setPeriodStart(next)} className="rounded border border-gray-300 px-2 py-1 text-sm" />
          <DatePicker value={periodEnd} onChange={(next) => setPeriodEnd(next)} className="rounded border border-gray-300 px-2 py-1 text-sm" />
          <Button
            disabled={!companyId || !selectedAgencyId || !periodStart || !periodEnd}
            loading={prepareReturnMutation.isPending}
            onClick={() => prepareReturnMutation.mutate()}
          >
            Prepare
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 font-semibold">Agency</th>
              <th className="px-3 py-2 font-semibold">Period</th>
              <th className="px-3 py-2 font-semibold">Taxable</th>
              <th className="px-3 py-2 font-semibold">Collected</th>
              <th className="px-3 py-2 font-semibold">Owed</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(returnsQuery.data?.returns ?? []).map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-3 py-2">{row.agency_name ?? row.agency_id}</td>
                <td className="px-3 py-2">{row.period_start} to {row.period_end}</td>
                <td className="px-3 py-2">{money(row.taxable_sales_cents)}</td>
                <td className="px-3 py-2">{money(row.tax_collected_cents)}</td>
                <td className="px-3 py-2">{money(row.tax_owed_cents)}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={row.status !== "open"}
                      onClick={() => {
                        void fileSalesTaxReturn(row.id, companyId)
                          .then(async () => {
                            await queryClient.invalidateQueries({ queryKey: ["sales-tax", "returns", companyId] });
                            pushToast("Return marked filed", "success");
                          })
                          .catch((error) => pushToast(String((error as Error).message ?? "Failed to mark filed"), "error"));
                      }}
                    >
                      Mark filed
                    </Button>
                    <Button
                      size="sm"
                      disabled={row.status === "paid"}
                      onClick={() => {
                        void markSalesTaxReturnPaid(row.id, { operating_company_id: companyId })
                          .then(async () => {
                            await queryClient.invalidateQueries({ queryKey: ["sales-tax", "returns", companyId] });
                            pushToast("Return marked paid", "success");
                          })
                          .catch((error) => pushToast(String((error as Error).message ?? "Failed to mark paid"), "error"));
                      }}
                    >
                      Mark paid
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {(returnsQuery.data?.returns ?? []).length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={7}>
                  No sales tax returns prepared yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AccountingSubNavWrapper>
  );
}
