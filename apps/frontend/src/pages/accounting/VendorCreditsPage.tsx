import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { listVendors } from "../../api/mdata";
import { listVendorBills, type VendorBill } from "../../api/accounting";
import {
  applyVendorCredit,
  createVendorCredit,
  getNextVendorCreditDocumentNumber,
  getVendorCredit,
  listVendorCredits,
  voidVendorCredit,
  type VendorCredit,
  type VendorCreditApplication,
  type VendorCreditStatus,
} from "../../api/vendor-credits";
import { Button } from "../../components/Button";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel, visibleDocumentLabel } from "../../lib/entity-label";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useToast } from "../../components/Toast";
import { CappedListNotice } from "../../components/CappedListNotice";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const companyId = selectedCompanyId ?? "";
  const canWrite = WRITE_ROLES.has(user?.role ?? "");

  // LST-F5202 — visible vendor filter; CLS-ADJACENT — stages with status, URL only on Apply.
  const vendorFilter = searchParams.get("vendor_id") ?? "";
  function setVendorFilter(next: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set("vendor_id", next);
        else params.delete("vendor_id");
        return params;
      },
      { replace: true }
    );
  }
  const deepLinkCreditId = searchParams.get("credit_id");
  const [statusFilter, setStatusFilter] = useState<VendorCreditStatus | "">("");
  const staged = useStagedListFilters({
    applied: { statusFilter, vendorId: vendorFilter },
    empty: { statusFilter: "" as const, vendorId: "" },
    onApply: (next) => {
      setStatusFilter(next.statusFilter);
      setVendorFilter(next.vendorId);
    },
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCreditId, setSelectedCreditId] = useState<string | null>(deepLinkCreditId);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyBillId, setApplyBillId] = useState<string | null>(null);
  const [applyAmountCents, setApplyAmountCents] = useState<number | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [createVendorId, setCreateVendorId] = useState<string | null>(vendorFilter || null);
  const [createAmountCents, setCreateAmountCents] = useState<number | null>(null);
  const [createNotes, setCreateNotes] = useState("");
  const nextCreditNumberQuery = useQuery({
    queryKey: ["accounting", "vendor-credits", "next-number", companyId],
    queryFn: () => getNextVendorCreditDocumentNumber(companyId),
    enabled: Boolean(companyId && createOpen),
    staleTime: 15_000,
  });
  const nextCreditNumber = nextCreditNumberQuery.data?.document_number?.trim() ?? "";

  const vendorsQuery = useQuery({
    queryKey: ["vendors", "picker", companyId],
    queryFn: () => listVendors({ operating_company_id: companyId, limit: 1000 }),
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
  const selectedCredit = useMemo(
    () => (creditsQuery.data?.credits ?? []).find((credit) => credit.id === selectedCreditId) ?? null,
    [creditsQuery.data?.credits, selectedCreditId],
  );
  const creditDetailQuery = useQuery({
    queryKey: ["accounting", "vendor-credit", companyId, selectedCreditId],
    queryFn: () => getVendorCredit(companyId, selectedCreditId!),
    enabled: Boolean(companyId && selectedCreditId),
  });
  const credit = creditDetailQuery.data?.credit ?? selectedCredit;
  const vendorBillsQuery = useQuery({
    queryKey: ["accounting", "vendor-credit-open-bills", companyId, credit?.vendor_id],
    queryFn: () => listVendorBills(companyId, { vendor_id: credit!.vendor_id, has_balance: true, limit: 500 }),
    enabled: Boolean(companyId && credit?.vendor_id && applyOpen),
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
      await queryClient.invalidateQueries({ queryKey: ["accounting", "vendor-credits", "next-number", companyId] });
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Create failed", "error"),
  });
  const applyMut = useMutation({
    mutationFn: () =>
      applyVendorCredit(companyId, selectedCreditId!, [
        { bill_id: applyBillId as string, applied_cents: applyAmountCents as number },
      ]),
    onSuccess: async () => {
      pushToast("Vendor credit applied to bill", "success");
      setApplyOpen(false);
      setApplyBillId(null);
      setApplyAmountCents(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounting", "vendor-credits", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["accounting", "vendor-credit", companyId, selectedCreditId] }),
        queryClient.invalidateQueries({ queryKey: ["accounting", "bills"] }),
      ]);
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Apply failed", "error"),
  });
  const voidMut = useMutation({
    mutationFn: (reason: string) => voidVendorCredit(companyId, selectedCreditId!, reason),
    onSuccess: async () => {
      pushToast("Vendor credit voided", "success");
      setVoidOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounting", "vendor-credits", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["accounting", "vendor-credit", companyId, selectedCreditId] }),
        queryClient.invalidateQueries({ queryKey: ["accounting", "bills"] }),
      ]);
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Void failed", "error"),
  });

  const columns = useMemo<Array<ParityColumn<VendorCredit>>>(
    () => [
      {
        key: "display_id",
        label: "Credit #",
        sortable: true,
        render: (row) => entityLabel(row.display_id, row.id, "Vendor credit"),
      },
      {
        key: "vendor_id",
        label: "Vendor",
        sortable: true,
        render: (row) => (
          <EntityLink kind="vendor" id={row.vendor_id} label={entityLabel(row.vendor_name, row.vendor_id, "Vendor")} />
        ),
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

  // ACCT-F5606-C — sibling of CreditMemosPage's ACCT-F5606-B: this used to derive the filter-badge
  // name ONLY from creditsQuery's data -- which is ALREADY filtered to this same vendor_id. Any
  // vendor with zero vendor credits (the common case) made .find() return undefined, so a perfectly
  // valid, visible vendor rendered as "Vendor — not visible" -- a label entity-label.ts reserves for
  // a real RLS/deactivation signal (a row entity-scoped joins can't resolve). vendorOptions (from
  // listVendors, unfiltered by vendor-credit activity) is the complete roster for this company, so
  // check it first; only fall back to the credits row if the id is somehow absent from the roster too
  // (that IS a genuine not-visible signal).
  const filterVendorName = useMemo(() => {
    if (!vendorFilter) return null;
    const fromRoster = vendorOptions.find((v) => v.value === vendorFilter)?.label ?? null;
    if (fromRoster) return fromRoster;
    return (creditsQuery.data?.credits ?? []).find((c) => c.vendor_id === vendorFilter)?.vendor_name ?? null;
  }, [vendorOptions, creditsQuery.data?.credits, vendorFilter]);

  const filterBar = (
    <div className="flex flex-wrap items-end gap-3" data-vendor-credits-filter-toolbar="collapsed">
      <CollapsedListFilters activeFilterCount={(statusFilter ? 1 : 0) + (vendorFilter ? 1 : 0)} testIdPrefix="vendor-credits" onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}>
        <div className="flex flex-wrap gap-2">
          <label className="text-[11px] text-slate-600">
            Vendor
            <EntityPicker
              kind="vendor"
              operatingCompanyId={companyId}
              value={staged.draft.vendorId || null}
              onChange={(next) => staged.setDraft({ ...staged.draft, vendorId: next ?? "" })}
              allowCreate={false}
              placeholder="All vendors"
              className="mt-1"
              dataTestId="vendor-credits-filter-vendor"
            />
          </label>
          <select
            value={staged.draft.statusFilter}
            onChange={(e) => staged.setDraft({ ...staged.draft, statusFilter: e.target.value as VendorCreditStatus | "" })}
            className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm"
            aria-label="Vendor credit status filter"
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="applied">Applied</option>
            <option value="voided">Voided</option>
          </select>
        </div>
      </CollapsedListFilters>
      {vendorFilter ? (
        <span className="text-xs text-gray-600">
          Filtered to vendor{" "}
          <EntityLink kind="vendor" id={vendorFilter} label={entityLabel(filterVendorName, vendorFilter, "Vendor")} />
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
          onRowClick={(row) => setSelectedCreditId(row.id)}
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
          <div className="flex w-full items-start gap-3" data-testid="qbo-vendor-credit-header">
            <label className="min-w-0 flex-1 block">
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
                <CappedListNotice
                  shown={vendorOptions.length}
                  limit={1000}
                  total={vendorsQuery.data?.total ?? null}
                  hint="Type in the vendor field to search the full roster."
                  className="mt-1 text-[11px] text-slate-600"
                />
              </div>
            </label>
            <label className="ml-auto w-44 shrink-0 text-right text-xs font-semibold text-gray-700" htmlFor="vendor-credit-ref-no">
              Ref no.
              <input
                id="vendor-credit-ref-no"
                aria-label="Ref no."
                data-testid="vendor-credit-number"
                readOnly
                className="mt-1 h-8 w-full rounded-sm border border-gray-300 bg-gray-100 px-2 text-right text-xs"
                value={nextCreditNumber}
                placeholder={nextCreditNumberQuery.isLoading ? "…" : "Assigned on save"}
              />
            </label>
          </div>
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

      <ParityDrawer
        open={Boolean(selectedCreditId)}
        onClose={() => setSelectedCreditId(null)}
        title={credit ? entityLabel(credit.display_id, credit.id, "Vendor credit") : "Vendor credit"}
        size="wide"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSelectedCreditId(null)}>
              Close
            </Button>
            {canWrite && credit && credit.status !== "voided" && Number(credit.amount_unapplied_cents) > 0 ? (
              <Button type="button" onClick={() => setApplyOpen(true)}>
                Apply to bill
              </Button>
            ) : null}
            {canWrite && credit && credit.status !== "voided" ? (
              <Button type="button" variant="danger" onClick={() => setVoidOpen(true)}>
                Void
              </Button>
            ) : null}
          </div>
        }
      >
        {creditDetailQuery.isLoading ? <p className="text-sm text-slate-500">Loading vendor credit...</p> : null}
        {creditDetailQuery.isError ? (
          <ListErrorState
            title="Couldn't load vendor credit"
            status={0}
            message={(creditDetailQuery.error as Error)?.message}
            onRetry={() => void creditDetailQuery.refetch()}
          />
        ) : null}
        {credit ? (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-sm border border-slate-200 bg-slate-50 p-3">
              <div>
                <dt className="text-xs font-semibold text-slate-600">Vendor</dt>
                <dd className="mt-0.5">
                  <EntityLink
                    kind="vendor"
                    id={credit.vendor_id}
                    label={entityLabel(credit.vendor_name, credit.vendor_id, "Vendor")}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-600">Issue date</dt>
                <dd className="mt-0.5 text-slate-900">{formatDateUS(credit.issue_date)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-600">Credit amount</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{money(credit.amount_cents)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-600">Unapplied</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{money(credit.amount_unapplied_cents)}</dd>
              </div>
            </dl>
            {credit.notes ? (
              <div>
                <h3 className="text-xs font-semibold text-slate-600">Notes</h3>
                <p className="mt-1 whitespace-pre-wrap text-slate-800">{credit.notes}</p>
              </div>
            ) : null}
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Applied bills</h3>
              <VendorCreditApplications applications={creditDetailQuery.data?.applications ?? []} />
            </div>
          </div>
        ) : null}
      </ParityDrawer>

      <ParityDrawer
        open={applyOpen}
        onClose={() => {
          setApplyOpen(false);
          setApplyBillId(null);
          setApplyAmountCents(null);
        }}
        title="Apply vendor credit to bill"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setApplyOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              loading={applyMut.isPending}
              disabled={!applyBillId || !applyAmountCents || applyAmountCents <= 0 || applyMut.isPending}
              onClick={() => applyMut.mutate()}
            >
              Apply credit
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            Available credit: <span className="font-semibold text-slate-900">{money(Number(credit?.amount_unapplied_cents ?? 0))}</span>
          </p>
          {vendorBillsQuery.isError ? (
            <ListErrorState
              title="Couldn't load open bills"
              status={0}
              message={(vendorBillsQuery.error as Error)?.message}
              onRetry={() => void vendorBillsQuery.refetch()}
            />
          ) : null}
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Open bill *</span>
            <div className="mt-1">
              <SelectCombobox
                value={applyBillId ?? ""}
                onChange={(event) => setApplyBillId(event.target.value || null)}
                disabled={vendorBillsQuery.isLoading}
                aria-label="Open bill"
              >
                <option value="">Select an open bill</option>
                {(vendorBillsQuery.data?.rows ?? []).map((bill: VendorBill) => (
                  <option key={bill.id} value={bill.id}>
                    {visibleDocumentLabel(bill.bill_number, bill.id, "Bill")} — {money(Math.max(0, Number(bill.amount_cents) - Number(bill.paid_cents)))}
                  </option>
                ))}
              </SelectCombobox>
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Apply amount *</span>
            <div className="mt-1">
              <MoneyInput valueCents={applyAmountCents} onChangeCents={setApplyAmountCents} ariaLabel="Vendor credit apply amount" />
            </div>
          </label>
          <p className="text-xs text-slate-500">
            The server verifies both the remaining credit and the selected bill&apos;s remaining balance before recording the application.
          </p>
        </div>
      </ParityDrawer>

      <VoidReasonModal
        open={voidOpen}
        title="Void vendor credit"
        entityRef={
          credit
            ? `${entityLabel(credit.display_id, credit.id, "Vendor credit")} · ${money(credit.amount_cents)}`
            : undefined
        }
        minLength={1}
        postsReversingEntry={false}
        onClose={() => setVoidOpen(false)}
        onSubmit={async (reason) => {
          await voidMut.mutateAsync(reason);
        }}
      />
    </AccountingSubNavWrapper>
  );
}

function VendorCreditApplications({ applications }: { applications: VendorCreditApplication[] }) {
  if (applications.length === 0) {
    return <p className="mt-1 text-sm text-slate-500">No bills have been credited yet.</p>;
  }
  return (
    <div className="mt-2 space-y-2">
      {applications.map((application) => (
        <div key={application.id} className="flex items-center justify-between gap-3 rounded-sm border border-slate-200 px-3 py-2">
          <EntityLink kind="bill" id={application.bill_id} label={visibleDocumentLabel(application.bill_number, application.bill_id, "Bill")} />
          <div className="text-right text-xs text-slate-600">
            <div className="font-semibold text-slate-900">{money(application.applied_cents)}</div>
            <div>{application.voided_at ? "Voided application" : `Applied ${formatDateUS(application.applied_at)}`}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
