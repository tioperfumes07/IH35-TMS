import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSalesTaxAgency,
  fileSalesTaxReturn,
  listSalesTaxAgencies,
  listSalesTaxReturns,
  markSalesTaxReturnPaid,
  prepareSalesTaxReturn,
  type SalesTaxReturn,
} from "../../api/accounting";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel, visibleDocumentLabel } from "../../lib/entity-label";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function SalesTaxPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  /*
    DEEP-LINK READER — EntityLink kind="sales_tax_return" resolves to
    /accounting/sales-tax?return_id=<id>. Without this the param was silently discarded and the
    operator landed on the unfiltered list with nothing selected, which is a cosmetic link, not a
    drill-through. Highlighting the row is what makes that link real.
  */
  const [searchParams] = useSearchParams();
  const highlightReturnId = searchParams.get("return_id");


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
    onError: (error) => pushToast(userFacingApiError(error, "Failed to create agency"), "error"),
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
    onError: (error) => pushToast(userFacingApiError(error, "Failed to prepare return"), "error"),
  });

  const agencyVendorById = useMemo(() => {
    const map = new Map<string, string>();
    for (const agency of agenciesQuery.data?.agencies ?? []) {
      if (agency.agency_vendor_id) map.set(agency.id, agency.agency_vendor_id);
    }
    return map;
  }, [agenciesQuery.data?.agencies]);

  const returnColumns = useMemo<Array<ParityColumn<SalesTaxReturn>>>(
    () => [
      {
        key: "agency_name",
        label: "Agency",
        sortable: true,
        render: (row) => {
          const vendorId = agencyVendorById.get(row.agency_id);
          if (vendorId) {
            return (
              <EntityLink
                kind="vendor"
                id={vendorId}
                label={entityLabel(row.agency_name, row.agency_id, "Agency")}
              />
            );
          }
          return entityLabel(row.agency_name, row.agency_id, "Agency");
        },
        sortValue: (row) => entityLabel(row.agency_name, row.agency_id, "Agency"),
      },
      {
        key: "period_start",
        label: "Period",
        sortable: true,
        render: (row) => (
          <>
            {row.period_start} to {row.period_end}
          </>
        ),
      },
      {
        key: "taxable_sales_cents",
        label: "Taxable",
        sortable: true,
        render: (row) => money(row.taxable_sales_cents),
        sortValue: (row) => Number(row.taxable_sales_cents ?? 0),
      },
      {
        key: "tax_collected_cents",
        label: "Collected",
        sortable: true,
        render: (row) => money(row.tax_collected_cents),
        sortValue: (row) => Number(row.tax_collected_cents ?? 0),
      },
      {
        key: "tax_owed_cents",
        label: "Owed",
        sortable: true,
        render: (row) => money(row.tax_owed_cents),
        sortValue: (row) => Number(row.tax_owed_cents ?? 0),
      },
      { key: "status", label: "Status", sortable: true },
      {
        key: "paid_bill_id",
        label: "Payment bill",
        sortable: true,
        render: (row) =>
          row.paid_bill_id ? (
            <EntityLink kind="bill" id={row.paid_bill_id} label={visibleDocumentLabel(row.paid_bill_number, row.paid_bill_id, "Bill")} />
          ) : (
            "—"
          ),
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) => (
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
                  .catch((error) => pushToast(userFacingApiError(error, "Failed to mark filed"), "error"));
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
                  .catch((error) => pushToast(userFacingApiError(error, "Failed to mark paid"), "error"));
              }}
            >
              Mark paid
            </Button>
          </div>
        ),
      },
    ],
    [agencyVendorById, companyId, queryClient, pushToast]
  );

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
        <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
          <div className="text-xs text-gray-500">Taxable sales</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">{money(totals.taxable)}</div>
        </div>
        <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
          <div className="text-xs text-gray-500">Tax collected</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">{money(totals.collected)}</div>
        </div>
        <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
          <div className="text-xs text-gray-500">Tax owed</div>
          <div className="mt-1 text-lg font-semibold text-gray-900">{money(totals.owed)}</div>
        </div>
      </div>

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-2 text-sm font-semibold text-gray-900">Create agency</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            value={agencyName}
            onChange={(event) => setAgencyName(event.target.value)}
            placeholder="Agency name"
            className="rounded-sm border border-gray-300 px-2 py-1 text-sm"
          />
          <input
            value={jurisdiction}
            onChange={(event) => setJurisdiction(event.target.value)}
            placeholder="Jurisdiction (optional)"
            className="rounded-sm border border-gray-300 px-2 py-1 text-sm"
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

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-2 text-sm font-semibold text-gray-900">Prepare return</div>
        {agenciesQuery.isError ? (
          <div className="mb-2">
            <ListErrorBanner
              message={`Failed to load sales tax agencies: ${(agenciesQuery.error as Error)?.message ?? "Request failed"}`}
              onRetry={() => void agenciesQuery.refetch()}
            />
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <SelectCombobox
            className="rounded-sm border border-gray-300 px-2 py-1 text-sm"
            value={selectedAgencyId}
            onChange={(event) => setSelectedAgencyId(event.target.value)}
          >
            <option value="">Select agency</option>
            {(agenciesQuery.data?.agencies ?? []).map((agency) => (
              <option key={agency.id} value={agency.id}>
                {agency.name}
              </option>
            ))}
          </SelectCombobox>
          <DatePicker value={periodStart} onChange={(next) => setPeriodStart(next)} className="" />
          <DatePicker value={periodEnd} onChange={(next) => setPeriodEnd(next)} className="" />
          <Button
            disabled={!companyId || !selectedAgencyId || !periodStart || !periodEnd}
            loading={prepareReturnMutation.isPending}
            onClick={() => prepareReturnMutation.mutate()}
          >
            Prepare
          </Button>
        </div>
      </div>

      {returnsQuery.isError ? (
        <ListErrorState
          title="Couldn't load sales tax returns"
          status={0}
          message={(returnsQuery.error as Error)?.message}
          onRetry={() => void returnsQuery.refetch()}
        />
      ) : (
        <ParityTable
          rows={returnsQuery.data?.returns ?? []}
          columns={returnColumns}
          rowKey={(row) => row.id}
          rowClassName={(row) => (highlightReturnId && row.id === highlightReturnId ? "bg-slate-100" : "")}
          loading={returnsQuery.isLoading}
          emptyText="No sales tax returns prepared yet."
          storageKey="accounting-sales-tax-returns"
          tableTestId="sales-tax-returns-table"
        />
      )}
    </AccountingSubNavWrapper>
  );
}
