import { useQuery } from "@tanstack/react-query";
import { formatDateTimeUS } from "../../../lib/formatDate";
import { resolveApiUrl } from "../../../api/client";
import { useMemo, useState } from "react";
import { PageHeader } from "../../../components/layout/PageHeader";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";

type EdiMessage = {
  uuid: string;
  partner_uuid: string;
  transaction_type: string;
  direction: string;
  control_number: string;
  status: string;
  error_message: string | null;
  related_load_uuid: string | null;
  related_load_number: string | null;
  received_at: string;
};

async function fetchMessages(companyId: string, status?: string): Promise<EdiMessage[]> {
  const params = new URLSearchParams({ operating_company_id: companyId });
  if (status) params.set("status", status);
  const res = await fetch(resolveApiUrl(`/api/integrations/edi/messages?${params}`), { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load EDI messages");
  const data = (await res.json()) as { messages: EdiMessage[] };
  return data.messages ?? [];
}

function statusBadgeClass(status: string): string {
  if (status === "processed" || status === "sent" || status === "acknowledged") return "bg-green-100 text-green-800";
  if (status === "failed") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
}

const COLUMNS: Array<ParityColumn<EdiMessage>> = [
  {
    key: "transaction_type",
    label: "Type",
    sortable: true,
    render: (row) => <span className="font-mono">{row.transaction_type}</span>,
  },
  {
    key: "direction",
    label: "Dir",
    sortable: true,
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (row) => (
      <span className={`rounded-sm px-2 py-0.5 text-xs ${statusBadgeClass(row.status)}`}>{row.status}</span>
    ),
  },
  {
    key: "control_number",
    label: "Control #",
    sortable: true,
    render: (row) => <span className="font-mono text-xs">{row.control_number}</span>,
  },
  {
    key: "received_at",
    label: "Received",
    sortable: true,
    sortValue: (row) => row.received_at,
    render: (row) => <span className="text-xs">{formatDateTimeUS(row.received_at)}</span>,
  },
];

export function EdiTransactionLog() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);

  const messagesQuery = useQuery({
    queryKey: ["integrations", "edi", "messages", companyId, statusFilter],
    queryFn: () => fetchMessages(companyId, statusFilter || undefined),
    enabled: Boolean(companyId),
  });

  const selected = useMemo(
    () => (messagesQuery.data ?? []).find((m) => m.uuid === selectedUuid) ?? null,
    [messagesQuery.data, selectedUuid],
  );

  return (
    <div data-testid="edi-transaction-log">
      <PageHeader title="EDI Transaction Log" subtitle="Inbound/outbound 204 · 214 · 210 · 990 messages" />
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium">Status</label>
          <select
            className="rounded-sm border px-3 py-2 text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="received">Received</option>
            <option value="parsed">Parsed</option>
            <option value="processed">Processed</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {messagesQuery.isError ? (
          <ListErrorState
            title="Couldn't load EDI messages"
            status={0}
            message={(messagesQuery.error as Error)?.message}
            onRetry={() => void messagesQuery.refetch()}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="overflow-auto rounded-sm border border-gray-200 bg-white p-2">
              <ParityTable
                rows={messagesQuery.data ?? []}
                columns={COLUMNS}
                rowKey={(row) => row.uuid}
                loading={messagesQuery.isLoading}
                storageKey="edi-transaction-log"
                emptyText="No EDI messages yet"
                exportFilename="edi-transaction-log"
                tableTestId="edi-transaction-log-table"
                rowTestId={(row) => `edi-transaction-log-row-${row.uuid}`}
                onRowClick={(row) => setSelectedUuid(row.uuid)}
                rowClassName={(row) => (row.uuid === selectedUuid ? "bg-slate-100" : "")}
              />
            </div>

            <div className="rounded-sm border p-4">
              <h3 className="mb-2 text-xs font-semibold">Raw EDI viewer</h3>
              {selected ? (
                <div className="space-y-2 text-xs">
                  <p>
                    <span className="font-medium">Message:</span> {selected.transaction_type} · {selected.direction}
                  </p>
                  {selected.error_message && <p className="text-red-600">{selected.error_message}</p>}
                  {selected.related_load_uuid && (
                    <p>
                      <span className="font-medium">Load:</span>{" "}
                      <EntityLink kind="load" id={selected.related_load_uuid} label={entityLabel(selected.related_load_number, selected.related_load_uuid, "Load")} />
                    </p>
                  )}
                  <button
                    type="button"
                    className="rounded-sm border px-3 py-1 text-xs"
                    onClick={() => pushToastPlaceholder("Reprocess queued (foundation stub)")}
                  >
                    Reprocess
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-500">Select a message to inspect</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function pushToastPlaceholder(_msg: string) {
  /* foundation stub — full reprocess wired post-merge */
}
