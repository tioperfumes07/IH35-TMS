import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { listVendors } from "../../api/mdata";
import {
  createVendorCredit,
  listVendorCredits,
  type VendorCredit,
  type VendorCreditStatus,
} from "../../api/vendor-credits";
import { Button } from "../../components/Button";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { EntityLink } from "../../components/shared/EntityLink";
import { CollapsedListFilters } from "../../components/table";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../auth/useAuth";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

const WRITE_ROLES = new Set(["Owner", "Administrator", "Manager", "Accountant"]);

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function VendorCreditsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const companyId = selectedCompanyId ?? "";
  const canWrite = WRITE_ROLES.has(user?.role ?? "");

  const vendorFilter = searchParams.get("vendor_id") ?? "";
  const [statusFilter, setStatusFilter] = useState<VendorCreditStatus | "">("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createVendorId, setCreateVendorId] = useState<string | null>(vendorFilter || null);
  const [createAmountCents, setCreateAmountCents] = useState<number | null>(null);
  const [createNotes, setCreateNotes] = useState("");

  const vendorsQuery = useQuery({
    queryKey: ["vendors", "picker", companyId],
    queryFn: () => listVendors({ operating_company_id: companyId, limit: 500 }),
    enabled: Boolean(companyId),
  });
  const vendorOptions = useMemo(
    () =>
      (vendorsQuery.data?.vendors ?? []).map((v) => ({
        value: v.id,
        label: v.name ?? v.id,
      })),
    [vendorsQuery.data?.vendors],
  );

  const creditsQuery = useQuery({
    queryKey: ["accounting", "vendor-credits", companyId, vendorFilter, statusFilter],
    queryFn: () =>
      listVendorCredits(companyId, {
        vendor_id: vendorFilter || undefined,
        status: statusFilter || undefined,
      }),
    enabled: Boolean(companyId),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createVendorCredit(companyId, {
        vendor_id: createVendorId as string,
        amount_cents: createAmountCents as number,
        notes: createNotes.trim() || undefined,
      }),
    onSuccess: async () => {
      pushToast("Vendor credit created", "success");
      setCreateOpen(false);
      setCreateAmountCents(null);
      setCreateNotes("");
      await queryClient.invalidateQueries({ queryKey: ["accounting", "vendor-credits", companyId] });
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Create failed", "error"),
  });

  const columns = useMemo<Array<ParityColumn<VendorCredit>>>(
    () => [
      {
        key: "display_id",
        label: "Credit #",
        sortable: true,
        render: (row) => row.display_id,
      },
      {
        key: "vendor_id",
        label: "Vendor",
        sortable: true,
        render: (row) => <EntityLink kind="vendor" id={row.vendor_id} />,
      },
      {
        key: "issue_date",
        label: "Issue date",
        sortable: true,
        render: (row) => formatDateUS(row.issue_date),
      },
      {
        key: "amount_cents",
        label: "Amount",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        render: (row) => money(row.amount_cents),
      },
      {
        key: "amount_unapplied_cents",
        label: "Unapplied",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums font-semibold",
        render: (row) => money(row.amount_unapplied_cents),
      },
      { key: "status", label: "Status", sortable: true },
    ],
    [],
  );

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2" data-vendor-credits-filter-toolbar="collapsed">
      <CollapsedListFilters activeFilterCount={(statusFilter ? 1 : 0) + (vendorFilter ? 1 : 0)} testIdPrefix="vendor-credits">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as VendorCreditStatus | "")}
          className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm"
          aria-label="Vendor credit status filter"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="applied">Applied</option>
          <option value="voided">Voided</option>
        </select>
      </CollapsedListFilters>
      {vendorFilter ? (
        <span className="text-xs text-gray-600">
          Filtered to vendor <EntityLink kind="vendor" id={vendorFilter} label={vendorFilter.slice(0, 8)} />
        </span>
      ) : null}
    </div>
  );

  return (
    <AccountingSubNavWrapper
      title="Vendor credits"
      subtitle="Open vendor credits reduce A/P when applied to bills (data-only until GL flags advance)"
      actions={
        canWrite ? (
          <Button
            onClick={() => {
              setCreateVendorId(vendorFilter || null);
              setCreateOpen(true);
            }}
          >
            + Create
          </Button>
        ) : null
      }
    >
      {creditsQuery.isError ? (
        <ListErrorState
          title="Couldn't load vendor credits"
          status={0}
          message={(creditsQuery.error as Error)?.message}
          onRetry={() => void creditsQuery.refetch()}
        />
      ) : (
        <ParityTable
          rows={creditsQuery.data?.credits ?? []}
          columns={columns}
          rowKey={(row) => row.id}
          loading={creditsQuery.isLoading}
          filterBar={filterBar}
          storageKey="accounting-vendor-credits"
          tableTestId="vendor-credits-table"
          emptyText="No vendor credits found."
        />
      )}

      {/* CHROME-12: money creator -> ParityDrawer side panel (never a centered Modal). A centered
          modal here would also invert the nested Create-vendor InlineCreateDrawer opened by the
          ReferenceSelect below. */}
      <ParityDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create vendor credit"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!createVendorId || createAmountCents == null || createAmountCents <= 0 || createMut.isPending}
              loading={createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Vendor *</span>
            <div className="mt-1">
              <ReferenceSelect
                value={createVendorId}
                onChange={setCreateVendorId}
                options={vendorOptions}
                createKind="vendor"
                operatingCompanyId={companyId}
                placeholder="Select vendor"
                disabled={!companyId}
              />
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Amount *</span>
            <div className="mt-1">
              <MoneyInput
                valueCents={createAmountCents}
                onChangeCents={setCreateAmountCents}
                ariaLabel="Vendor credit amount"
              />
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Notes</span>
            <textarea
              className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
              rows={2}
              value={createNotes}
              onChange={(e) => setCreateNotes(e.target.value)}
            />
          </label>
        </div>
      </ParityDrawer>
    </AccountingSubNavWrapper>
  );
}
