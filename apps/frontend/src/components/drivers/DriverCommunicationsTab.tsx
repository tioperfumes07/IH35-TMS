import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Mail, MessageSquare, Phone, RefreshCw } from "lucide-react";
import { useState } from "react";
import { type DriverCommEntry, getDriverCommunications } from "../../api/driver-messages";

const CHANNEL_OPTIONS = [
  { value: "", label: "All channels" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
  { value: "in_app", label: "In-App" },
] as const;

const PAGE_SIZE = 50;

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === "sms") return <MessageSquare className="h-3.5 w-3.5 text-blue-500" aria-label="SMS" />;
  if (channel === "email") return <Mail className="h-3.5 w-3.5 text-purple-500" aria-label="Email" />;
  if (channel === "in_app") return <Phone className="h-3.5 w-3.5 text-emerald-500" aria-label="In-App" />;
  return null;
}

function ChannelBadge({ channel }: { channel: string }) {
  const classes =
    channel === "sms"
      ? "bg-blue-50 text-blue-700"
      : channel === "email"
      ? "bg-purple-50 text-purple-700"
      : "bg-emerald-50 text-emerald-700";
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${classes}`}>
      <ChannelIcon channel={channel} />
      {channel === "in_app" ? "In-App" : channel.toUpperCase()}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: "inbound" | "outbound" }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
        direction === "inbound" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"
      }`}
    >
      {direction === "inbound" ? "← Driver" : "Office →"}
    </span>
  );
}

function DeliveryBadge({ status }: { status: string }) {
  const classes =
    status === "delivered" || status === "sent"
      ? "text-emerald-600"
      : status === "failed"
      ? "text-red-500"
      : status === "skipped"
      ? "text-amber-600"
      : "text-gray-400";
  return <span className={`text-[10px] ${classes}`}>{status}</span>;
}

function formatTs(ts: string) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export function DriverCommunicationsTab({
  driverId,
  operatingCompanyId,
}: {
  driverId: string;
  operatingCompanyId: string;
}) {
  const [channel, setChannel] = useState("");
  const [page, setPage] = useState(0);

  const offset = page * PAGE_SIZE;

  const query = useQuery({
    queryKey: ["driver-communications", driverId, operatingCompanyId, channel, page],
    queryFn: () =>
      getDriverCommunications(driverId, operatingCompanyId, {
        channel: channel || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    enabled: Boolean(driverId) && Boolean(operatingCompanyId),
    placeholderData: keepPreviousData,
  });

  const entries: DriverCommEntry[] = query.data?.entries ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleChannelChange = (next: string) => {
    setChannel(next);
    setPage(0);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Communications Timeline</h2>
        <div className="flex items-center gap-2">
          <select
            className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-700"
            value={channel}
            onChange={(e) => handleChannelChange(e.target.value)}
          >
            {CHANNEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50"
            onClick={() => void query.refetch()}
            aria-label="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-gray-500">Loading communications...</p>
      ) : query.isError ? (
        <p className="text-sm text-red-500">Failed to load communications.</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500">No communications recorded for this driver.</p>
      ) : (
        <>
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`flex gap-3 rounded border p-3 ${
                  entry.direction === "inbound"
                    ? "border-amber-100 bg-amber-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                <div className="mt-0.5 flex-shrink-0">
                  <ChannelIcon channel={entry.channel} />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ChannelBadge channel={entry.channel} />
                    <DirectionBadge direction={entry.direction} />
                    {entry.urgency ? (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 uppercase">
                        {entry.urgency}
                      </span>
                    ) : null}
                    <DeliveryBadge status={entry.delivery_status} />
                  </div>
                  <p className="break-words text-sm text-gray-900">{entry.message}</p>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                    <span>{formatTs(entry.created_at)}</span>
                    {entry.delivery_ref ? <span>ref: {entry.delivery_ref}</span> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-gray-200 pt-2 text-xs text-gray-600">
              <span>
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
