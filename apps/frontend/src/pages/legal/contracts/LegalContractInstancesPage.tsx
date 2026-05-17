import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { legalContractsApi, type LegalContractStatus } from "../../../api/legal-contracts";
import { Button } from "../../../components/Button";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { LegalModuleTabs } from "../LegalModuleTabs";
import { SendContractModal } from "./SendContractModal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

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
  if (status === "signed_electronically") return "rounded bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700";
  if (status === "sent" || status === "viewed") return "rounded bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700";
  if (status === "expired") return "rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800";
  if (status === "voided") return "rounded bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700";
  return "rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600";
}

export function LegalContractInstancesPage() {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LegalContractStatus>("all");
  const [templateFilter, setTemplateFilter] = useState("");
  const [signerTypeFilter, setSignerTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeDetailId, setActiveDetailId] = useState<string | null>(null);
  const openSend = searchParams.get("openSend") === "1";

  const listQuery = useQuery({
    queryKey: ["legal", "contracts", operatingCompanyId, statusFilter, search],
    enabled: Boolean(operatingCompanyId),
    queryFn: async () =>
      legalContractsApi.list({
        operating_company_id: operatingCompanyId,
        status: statusFilter === "all" ? undefined : statusFilter,
        search: search.trim() || undefined,
      }),
    refetchInterval: 30_000,
  });

  const detailQuery = useQuery({
    queryKey: ["legal", "contracts", "detail", operatingCompanyId, activeDetailId],
    enabled: Boolean(operatingCompanyId && activeDetailId),
    queryFn: () => legalContractsApi.get(String(activeDetailId), operatingCompanyId),
  });

  const rows = listQuery.data?.contracts ?? [];
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

  const selectedRows = useMemo(
    () => filteredRows.filter((row) => selectedIds.includes(row.id)),
    [filteredRows, selectedIds]
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["legal", "contracts"] });
    if (activeDetailId) {
      await queryClient.invalidateQueries({ queryKey: ["legal", "contracts", "detail", operatingCompanyId, activeDetailId] });
    }
  };

  const sendReminderMutation = useMutation({
    mutationFn: async () => {
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
    onError: (error) => pushToast(String((error as Error).message || "Failed to send reminder"), "error"),
  });

  return (
    <div className="space-y-3">
      <PageHeader
        title="Legal Contracts"
        subtitle="Instance tracking and signer workflows"
        actions={<Button onClick={() => setSearchParams({ openSend: "1" })}>+ Create Contract</Button>}
      />

      <LegalModuleTabs activeTabId="contracts" />

      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-9 rounded border border-gray-300 px-2 text-sm xl:col-span-2"
            placeholder="Search signer or template code"
          />
          <SelectCombobox
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | LegalContractStatus)}
            className="h-9 rounded border border-gray-300 px-2 text-sm"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectCombobox>
          <SelectCombobox
            value={templateFilter}
            onChange={(event) => setTemplateFilter(event.target.value)}
            className="h-9 rounded border border-gray-300 px-2 text-sm"
          >
            <option value="">All templates</option>
            {templateOptions.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </SelectCombobox>
          <SelectCombobox
            value={signerTypeFilter}
            onChange={(event) => setSignerTypeFilter(event.target.value)}
            className="h-9 rounded border border-gray-300 px-2 text-sm"
          >
            <option value="all">All signer types</option>
            <option value="driver">Driver</option>
            <option value="employee">Employee</option>
            <option value="customer">Customer</option>
            <option value="vendor">Vendor</option>
            <option value="other">Other</option>
          </SelectCombobox>
          <div className="grid grid-cols-2 gap-2 xl:col-span-2">
            <input value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} type="date" className="h-9 rounded border border-gray-300 px-2 text-sm" />
            <input value={dateTo} onChange={(event) => setDateTo(event.target.value)} type="date" className="h-9 rounded border border-gray-300 px-2 text-sm" />
          </div>
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={selectedRows.length === 0} loading={sendReminderMutation.isPending} onClick={() => sendReminderMutation.mutate()}>
            Send Reminder
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={selectedRows.length === 0}
            onClick={() => pushToast("Void action wiring is queued for legal workflow PR5.", "info")}
          >
            Void
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={selectedRows.length === 0}
            onClick={async () => {
              for (const row of selectedRows) {
                const detail = await legalContractsApi.get(row.id, operatingCompanyId);
                if (detail.signed_pdf_storage_url) {
                  window.open(detail.signed_pdf_storage_url, "_blank", "noopener,noreferrer");
                }
              }
            }}
          >
            Download
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-2 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={filteredRows.length > 0 && filteredRows.every((row) => selectedIds.includes(row.id))}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedIds(filteredRows.map((row) => row.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                  />
                </th>
                <th className="px-2 py-2 text-left">Template</th>
                <th className="px-2 py-2 text-left">Signer</th>
                <th className="px-2 py-2 text-left">Type</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-left">Sent</th>
                <th className="px-2 py-2 text-left">Signed</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => setActiveDetailId(row.id)}>
                  <td className="px-2 py-2" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.id)}
                      onChange={(event) => {
                        setSelectedIds((prev) =>
                          event.target.checked ? [...prev, row.id] : prev.filter((value) => value !== row.id)
                        );
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <div className="font-medium">{row.display_name_en ?? row.template_code}</div>
                    <div className="text-xs text-gray-500">{row.template_code} · v{row.template_version}</div>
                  </td>
                  <td className="px-2 py-2">
                    <div>{row.signer_name}</div>
                    <div className="text-xs text-gray-500">{row.signer_email ?? row.signer_phone ?? "No contact"}</div>
                  </td>
                  <td className="px-2 py-2">{row.signer_type}</td>
                  <td className="px-2 py-2">
                    <span className={statusClass(row.status)}>{row.status}</span>
                  </td>
                  <td className="px-2 py-2">{row.sent_at ? new Date(row.sent_at).toLocaleString() : "—"}</td>
                  <td className="px-2 py-2">{row.signed_at ? new Date(row.signed_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRows.length === 0 ? (
            <div className="px-2 py-4 text-sm text-gray-500">No contract instances found for current filters.</div>
          ) : null}
        </div>
      </div>

      {activeDetailId ? (
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">Instance Detail</div>
            <Button size="sm" variant="secondary" onClick={() => setActiveDetailId(null)}>
              Close
            </Button>
          </div>
          {!detailQuery.data ? (
            <div className="text-sm text-gray-500">Loading contract detail...</div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="grid gap-2 md:grid-cols-2">
                <div><span className="font-semibold">Signer:</span> {detailQuery.data.signer_name}</div>
                <div><span className="font-semibold">Template:</span> {detailQuery.data.template_code} v{detailQuery.data.template_version}</div>
                <div><span className="font-semibold">Status:</span> {detailQuery.data.status}</div>
                <div><span className="font-semibold">Language:</span> {detailQuery.data.language}</div>
              </div>
              <div className="rounded border border-gray-200 bg-gray-50 p-2">
                <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Filled Variables</div>
                <pre className="overflow-x-auto text-xs">{JSON.stringify(detailQuery.data.filled_variables ?? {}, null, 2)}</pre>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Signatures</div>
                  <div className="space-y-1">
                    {detailQuery.data.signatures.length === 0 ? <div className="text-xs text-gray-500">No signatures yet.</div> : null}
                    {detailQuery.data.signatures.map((signature) => (
                      <div key={signature.id} className="rounded border border-gray-200 bg-white px-2 py-1 text-xs">
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
                      <div key={entry.id} className="rounded border border-gray-200 bg-white px-2 py-1 text-xs">
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

      <SendContractModal
        open={openSend}
        operatingCompanyId={operatingCompanyId}
        onClose={() => setSearchParams({})}
        onSent={refresh}
      />
    </div>
  );
}
