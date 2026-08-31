import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { legalContractsApi, type LegalContractStatus, type LegalContractSummary } from "../../../api/legal-contracts";
import { Button } from "../../../components/Button";
import { PageHeader } from "../../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { LegalModuleTabs } from "../LegalModuleTabs";
import { SendContractModal } from "./SendContractModal";
import { LeaseToOwnCreatorModal } from "./LeaseToOwnCreatorModal";
import { TruckLeaseCreatorModal } from "./TruckLeaseCreatorModal";
import { UnifiedContractCreatorModal } from "./UnifiedContractCreatorModal";
import { useFeatureFlag } from "../../../hooks/useFeatureFlag";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { CollapsedListFilters, TableSearch, useStagedListFilters } from "../../../components/table";
import { userFacingApiError } from "../../../lib/api-error-message";
import { ListErrorState } from "../../../components/ListErrorState";
import { EntityLink, type EntityKind } from "../../../components/shared/EntityLink";

const STATUS_OPTIONS: Array<{ value: "all" | LegalContractStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "viewed", label: "Viewed" },
  { value: "signed_electronically", label: "Signed" },
  { value: "voided", label: "Voided" },
  { value: "expired", label: "Expired" },
];

function statusClass(status: LegalContractStatus) {
  if (status === "signed_electronically") return "rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700";
  if (status === "sent" || status === "viewed") return "rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700";
  if (status === "expired") return "rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700";
  if (status === "voided") return "rounded-sm bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700";
  return "rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600";
}

/** LV-LEGAL-CONTRACT-LIST-SIGNER-PLAIN-TEXT — list + detail share the same kind map. */
function signerKind(type: LegalContractSummary["signer_type"]): EntityKind | null {
  if (type === "driver" || type === "customer" || type === "vendor") return type;
  if (type === "employee") return "user";
  return null;
}

export function LegalContractInstancesPage() {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const signerTypeParam = searchParams.get("signer_type") as LegalContractSummary["signer_type"] | null;
  const signerEntityIdParam = searchParams.get("signer_entity_id") ?? undefined;
  const [statusFilter, setStatusFilter] = useState<"all" | LegalContractStatus>("all");
  const [templateFilter, setTemplateFilter] = useState("");
  const [signerTypeFilter, setSignerTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const staged = useStagedListFilters({
    applied: { statusFilter, templateFilter, signerTypeFilter, dateFrom, dateTo },
    empty: { statusFilter: "all" as const, templateFilter: "", signerTypeFilter: "all", dateFrom: "", dateTo: "" },
    onApply: (next) => { setStatusFilter(next.statusFilter); setTemplateFilter(next.templateFilter); setSignerTypeFilter(next.signerTypeFilter); setDateFrom(next.dateFrom); setDateTo(next.dateTo); },
  });
  const linkedContractId = searchParams.get("contract_id");
  const [activeDetailId, setActiveDetailId] = useState<string | null>(linkedContractId);
  useEffect(() => setActiveDetailId(linkedContractId), [linkedContractId]);
  const openSend = searchParams.get("openSend") === "1";
  const openCreate = searchParams.get("openCreate") === "1";
  const { enabled: leaseToOwnEnabled } = useFeatureFlag("LEGAL_CONTRACTS_ENABLED", operatingCompanyId || undefined);
  const openLeaseToOwn = searchParams.get("openLeaseToOwn") === "1";
  const openTruckLease = searchParams.get("openTruckLease") === "1";

  const ensureLibraryMutation = useMutation({
    mutationFn: () => legalContractsApi.ensureLibrary(operatingCompanyId),
    onSuccess: (res) => {
      pushToast(`Library ready — ${res.inserted} added, ${res.already_present} already present.`, "success");
    },
    onError: (error) => pushToast(userFacingApiError(error, "Seed failed"), "error"),
  });

  const listQuery = useQuery({
    queryKey: ["legal", "contracts", operatingCompanyId, statusFilter, search, signerTypeParam, signerEntityIdParam],
    enabled: Boolean(operatingCompanyId),
    queryFn: async () =>
      legalContractsApi.list({
        operating_company_id: operatingCompanyId,
        status: statusFilter === "all" ? undefined : statusFilter,
        search: search.trim() || undefined,
        signer_type: signerTypeParam ?? undefined,
        signer_entity_id: signerEntityIdParam,
      }),
    refetchInterval: 30_000,
  });

  const detailQuery = useQuery({
    queryKey: ["legal", "contracts", "detail", operatingCompanyId, activeDetailId],
    enabled: Boolean(operatingCompanyId && activeDetailId),
    queryFn: () => legalContractsApi.get(String(activeDetailId), operatingCompanyId),
  });

  const rows = useMemo(() => listQuery.data?.contracts ?? [], [listQuery.data?.contracts]);
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (templateFilter && row.template_code !== templateFilter) return false;
      if (signerTypeFilter !== "all" && row.signer_type !== signerTypeFilter) return false;
      if (dateFrom) {
        const fromMs = new Date(`${dateFrom}T00:00:00`).getTime();
        if (new Date(row.created_at).getTime() < fromMs) return false;
      }
      if (dateTo) {
        const toMs = new Date(`${dateTo}T23:59:59`).getTime();
        if (new Date(row.created_at).getTime() > toMs) return false;
      }
      return true;
    });
  }, [dateFrom, dateTo, rows, signerTypeFilter, templateFilter]);

  const templateOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.template_code))).sort(),
    [rows]
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["legal", "contracts"] });
    if (activeDetailId) {
      await queryClient.invalidateQueries({ queryKey: ["legal", "contracts", "detail", operatingCompanyId, activeDetailId] });
    }
  };

  const sendReminderMutation = useMutation({
    mutationFn: async (selectedRows: LegalContractSummary[]) => {
      for (const row of selectedRows) {
        const deliveryChannel = row.signer_email ? "email" : row.signer_phone ? "sms" : null;
        if (!deliveryChannel) continue;
        await legalContractsApi.send(row.id, operatingCompanyId, {
          verification_channel: "none",
          delivery_channel: deliveryChannel,
          custom_message: "Friendly reminder: your IH35 contract is pending signature.",
        });
      }
    },
    onSuccess: async () => {
      pushToast("Reminder sent for selected contracts", "success");
      await refresh();
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to send reminder"), "error"),
  });

  const columns = useMemo<ParityColumn<LegalContractSummary>[]>(
    () => [
      {
        key: "template_code",
        label: "Template",
        sortable: true,
        render: (row) => (
          <>
            <div className="font-medium">{row.display_name_en ?? row.template_code}</div>
            <div className="text-xs text-gray-500">{row.template_code} · v{row.template_version}</div>
          </>
        ),
      },
      {
        key: "signer_name",
        label: "Signer",
        sortable: true,
        render: (row) => {
          const kind = signerKind(row.signer_type);
          const entityId = row.signer_entity_id;
          return (
            <>
              {kind && entityId ? (
                <EntityLink
                  kind={kind}
                  id={entityId}
                  label={row.signer_name}
                  className="font-medium text-gray-900"
                  data-testid="legal-contract-list-signer-link"
                />
              ) : (
                <div data-testid="legal-contract-list-signer-plain">{row.signer_name}</div>
              )}
              <div className="text-xs text-gray-500">{row.signer_email ?? row.signer_phone ?? "No contact"}</div>
            </>
          );
        },
      },
      { key: "signer_type", label: "Type", sortable: true, render: (row) => row.signer_type },
      { key: "status", label: "Status", sortable: true, render: (row) => <span className={statusClass(row.status)}>{row.status}</span> },
      { key: "sent_at", label: "Sent", sortable: true, render: (row) => (row.sent_at ? new Date(row.sent_at).toLocaleString() : "—") },
      { key: "signed_at", label: "Signed", sortable: true, render: (row) => (row.signed_at ? new Date(row.signed_at).toLocaleString() : "—") },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <PageHeader
        breadcrumb={["Legal", "Contracts"]}
        title="Legal Contracts"
        subtitle="Instance tracking and signer workflows"
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setSearchParams({ openCreate: "1" })}>+ Create</Button>
            <Button variant="secondary" onClick={() => setSearchParams({ openSend: "1" })}>
              Manual send
            </Button>
            <Button
              variant="secondary"
              loading={ensureLibraryMutation.isPending}
              onClick={() => ensureLibraryMutation.mutate()}
            >
              Seed library
            </Button>
            {leaseToOwnEnabled && (
              <Button variant="secondary" onClick={() => setSearchParams({ openLeaseToOwn: "1" })}>
                + Lease-to-Own
              </Button>
            )}
            {leaseToOwnEnabled && (
              <Button variant="secondary" onClick={() => setSearchParams({ openTruckLease: "1" })}>
                + Truck Lease
              </Button>
            )}
          </div>
        }
      />

      <LegalModuleTabs />

      {listQuery.isError ? (
        <ListErrorState
          title="Couldn't load contract instances"
          status={0}
          message={(listQuery.error as Error)?.message}
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
      <ParityTable
        rows={filteredRows}
        columns={columns}
        rowKey={(row) => row.id}
        onRowClick={(row) => setActiveDetailId(row.id)}
        suppressToolbarSearch
        selectable
        batchActions={(selected) => (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={selected.length === 0}
              loading={sendReminderMutation.isPending}
              onClick={() => sendReminderMutation.mutate(selected)}
            >
              Send Reminder
            </Button>
            <Button size="sm" variant="secondary" disabled title="Bulk void not yet wired to a backend endpoint">
              Void
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={selected.length === 0}
              onClick={async () => {
                for (const row of selected) {
                  const detail = await legalContractsApi.get(row.id, operatingCompanyId);
                  // Signed instances open the executed PDF; unsigned drafts open the on-demand,
                  // watermarked DRAFT PDF (the signed PDF does not exist until e-signing).
                  const url = detail.signed_pdf_storage_url
                    ? detail.signed_pdf_storage_url
                    : legalContractsApi.draftPdfUrl(row.id, operatingCompanyId);
                  window.open(url, "_blank", "noopener,noreferrer");
                }
              }}
            >
              Download
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={selected.length === 0}
              onClick={() => {
                for (const row of selected) {
                  window.open(legalContractsApi.draftPdfUrl(row.id, operatingCompanyId), "_blank", "noopener,noreferrer");
                }
              }}
            >
              View draft PDF
            </Button>
          </>
        )}
        // Settled-only empty (LIST-EMPTY-1 invariant): loading stays true while pending OR while a
        // refetch is in flight with zero current rows, so emptyText never flashes mid-fetch — the
        // guard-locked literal is preserved verbatim below.
        loading={listQuery.isPending || (listQuery.isFetching && filteredRows.length === 0)}
        storageKey="legal-contracts"
        emptyText="No contract instances found for current filters."
        filterBar={
          <CollapsedListFilters
            activeFilterCount={
              (statusFilter !== "all" ? 1 : 0) +
              (templateFilter ? 1 : 0) +
              (signerTypeFilter !== "all" ? 1 : 0) +
              (dateFrom ? 1 : 0) +
              (dateTo ? 1 : 0)
            }
            onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}
            testIdPrefix="legal-contracts"
            dataAttributes={{ "data-legal-contracts-filter-toolbar": "collapsed" }}
            searchSlot={
              <TableSearch
                value={search}
                onChange={setSearch}
                placeholder="Search signer or template code"
                aria-label="Search signer or template code"
                className="w-64"
              />
            }
          >
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <SelectCombobox
                value={staged.draft.statusFilter}
                onChange={(event) => staged.setDraft({ ...staged.draft, statusFilter: event.target.value as "all" | LegalContractStatus })}
                className="h-9 rounded-sm border border-gray-300 px-2 text-sm"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectCombobox>
              <SelectCombobox
                value={staged.draft.templateFilter}
                onChange={(event) => staged.setDraft({ ...staged.draft, templateFilter: event.target.value })}
                className="h-9 rounded-sm border border-gray-300 px-2 text-sm"
              >
                <option value="">All templates</option>
                {templateOptions.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </SelectCombobox>
              <SelectCombobox
                value={staged.draft.signerTypeFilter}
                onChange={(event) => staged.setDraft({ ...staged.draft, signerTypeFilter: event.target.value })}
                className="h-9 rounded-sm border border-gray-300 px-2 text-sm"
              >
                <option value="all">All signer types</option>
                <option value="driver">Driver</option>
                <option value="employee">Employee</option>
                <option value="customer">Customer</option>
                <option value="vendor">Vendor</option>
                <option value="other">Other</option>
              </SelectCombobox>
              <div className="grid grid-cols-2 gap-2">
                <DatePicker value={staged.draft.dateFrom} onChange={(next) => staged.setDraft({ ...staged.draft, dateFrom: next })} className="h-9" />
                <DatePicker value={staged.draft.dateTo} onChange={(next) => staged.setDraft({ ...staged.draft, dateTo: next })} className="h-9" />
              </div>
            </div>
          </CollapsedListFilters>
        }
      />
      )}

      {activeDetailId ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">Instance Detail</div>
            <Button size="sm" variant="secondary" onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("contract_id");
              setSearchParams(next);
              setActiveDetailId(null);
            }}>
              Close
            </Button>
          </div>
          {detailQuery.isError ? (
            <ListErrorState
              title="Couldn't load contract detail"
              status={0}
              message={(detailQuery.error as Error)?.message}
              onRetry={() => void detailQuery.refetch()}
            />
          ) : !detailQuery.data ? (
            <div className="text-sm text-gray-500">Loading contract detail...</div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="grid gap-2 md:grid-cols-2">
                <div><span className="font-semibold">Signer:</span>{" "}{signerKind(detailQuery.data.signer_type) ? (
                  <EntityLink kind={signerKind(detailQuery.data.signer_type)!} id={detailQuery.data.signer_entity_id} label={detailQuery.data.signer_name} />
                ) : detailQuery.data.signer_name}</div>
                <div><span className="font-semibold">Template:</span>{" "}<EntityLink className="text-slate-700 underline" kind="legal_template" id={detailQuery.data.template_id} label={`${detailQuery.data.template_code} v${detailQuery.data.template_version}`} /></div>
                <div><span className="font-semibold">Status:</span> {detailQuery.data.status}</div>
                <div><span className="font-semibold">Language:</span> {detailQuery.data.language}</div>
              </div>
              <div className="rounded-sm border border-gray-200 bg-gray-50 p-2">
                <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Filled Variables</div>
                <pre className="overflow-x-auto text-xs">{JSON.stringify(detailQuery.data.filled_variables ?? {}, null, 2)}</pre>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Signatures</div>
                  <div className="space-y-1">
                    {detailQuery.data.signatures.length === 0 ? <div className="text-xs text-gray-500">No signatures yet.</div> : null}
                    {detailQuery.data.signatures.map((signature) => (
                      <div key={signature.id} className="rounded-sm border border-gray-200 bg-white px-2 py-1 text-xs">
                        {signature.signed_by_name} · {new Date(signature.signed_at).toLocaleString()} · IP {signature.signer_ip ?? "—"}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Audit Timeline</div>
                  <div className="max-h-44 space-y-1 overflow-auto">
                    {detailQuery.data.audit_log.length === 0 ? <div className="text-xs text-gray-500">No audit events yet.</div> : null}
                    {detailQuery.data.audit_log.map((entry) => (
                      <div key={entry.id} className="rounded-sm border border-gray-200 bg-white px-2 py-1 text-xs">
                        <div className="font-semibold">{entry.event_type}</div>
                        <div>{new Date(entry.created_at).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      <UnifiedContractCreatorModal
        open={openCreate}
        operatingCompanyId={operatingCompanyId}
        onClose={() => setSearchParams({})}
        onSaved={async (contractId) => {
          await refresh();
          setActiveDetailId(contractId);
          setSearchParams({ contract_id: contractId });
        }}
      />
      <SendContractModal
        open={openSend}
        operatingCompanyId={operatingCompanyId}
        onClose={() => setSearchParams({})}
        onSent={async (contractId) => {
          await refresh();
          setActiveDetailId(contractId);
          setSearchParams({ contract_id: contractId });
        }}
      />
      <LeaseToOwnCreatorModal
        open={openLeaseToOwn}
        operatingCompanyId={operatingCompanyId}
        onClose={() => setSearchParams({})}
        onSaved={async (contractId) => {
          await refresh();
          setActiveDetailId(contractId);
          setSearchParams({ contract_id: contractId });
        }}
      />
      <TruckLeaseCreatorModal
        open={openTruckLease}
        operatingCompanyId={operatingCompanyId}
        onClose={() => setSearchParams({})}
        onSaved={(contractId) => {
          void refresh();
          setActiveDetailId(contractId);
          setSearchParams({ contract_id: contractId });
        }}
      />
    </div>
  );
}
