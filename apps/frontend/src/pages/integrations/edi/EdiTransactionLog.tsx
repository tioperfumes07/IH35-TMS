import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";

type EdiMessage = {
  uuid: string;
  partner_uuid: string;
  transaction_type: string;
  direction: string;
  control_number: string;
  status: string;
  error_message: string | null;
  related_load_uuid: string | null;
  received_at: string;
};

async function fetchMessages(companyId: string, status?: string): Promise<EdiMessage[]> {
  const params = new URLSearchParams({ operating_company_id: companyId });
  if (status) params.set("status", status);
  const res = await fetch(`/api/integrations/edi/messages?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load EDI messages");
  const data = (await res.json()) as { messages: EdiMessage[] };
  return data.messages ?? [];
}

function statusBadgeClass(status: string): string {
  if (status === "processed" || status === "sent" || status === "acknowledged") return "bg-green-100 text-green-800";
  if (status === "failed") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
}

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
    [messagesQuery.data, selectedUuid]
  );

  return (
    <div data-testid="edi-transaction-log">
      <PageHeader title="EDI Transaction Log" subtitle="Inbound/outbound 204 · 214 · 210 · 990 messages" />
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium">Status</label>
          <select
            className="rounded border px-3 py-2 text-sm"
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

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="overflow-x-auto rounded border">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Dir</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Control #</th>
                  <th className="px-3 py-2">Received</th>
                </tr>
              </thead>
              <tbody>
                {(messagesQuery.data ?? []).map((m) => (
                  <tr
                    key={m.uuid}
                    className="cursor-pointer border-t hover:bg-gray-50"
                    onClick={() => setSelectedUuid(m.uuid)}
                  >
                    <td className="px-3 py-2 font-mono">{m.transaction_type}</td>
                    <td className="px-3 py-2">{m.direction}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${statusBadgeClass(m.status)}`}>
                        {m.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{m.control_number}</td>
                    <td className="px-3 py-2 text-xs">{m.received_at}</td>
                  </tr>
                ))}
                {(messagesQuery.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                      No EDI messages yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded border p-4">
            <h3 className="mb-2 text-sm font-semibold">Raw EDI viewer</h3>
            {selected ? (
              <div className="space-y-2 text-xs">
                <p>
                  <span className="font-medium">Message:</span> {selected.transaction_type} · {selected.direction}
                </p>
                {selected.error_message && <p className="text-red-600">{selected.error_message}</p>}
                {selected.related_load_uuid && (
                  <p>
                    <span className="font-medium">Load:</span> {selected.related_load_uuid}
                  </p>
                )}
                <button
                  type="button"
                  className="rounded border px-3 py-1 text-xs"
                  onClick={() => pushToastPlaceholder("Reprocess queued (foundation stub)")}
                >
                  Reprocess
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Select a message to inspect</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function pushToastPlaceholder(_msg: string) {
  /* foundation stub — full reprocess wired post-merge */
}
