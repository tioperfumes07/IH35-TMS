import type { AuditViewerEvent } from "../../api/audit";

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-blue-100 text-blue-800",
  warning: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-800",
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function PayloadSection({ label, data }: { label: string; data: unknown }) {
  if (data == null) {
    return (
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
        <span className="text-xs text-gray-400">—</span>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      <pre className="max-h-52 overflow-auto rounded border border-gray-100 bg-gray-50 p-2 text-[11px] leading-tight">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

type Props = {
  event: AuditViewerEvent;
  onClose: () => void;
};

export function AuditEventCard({ event, onClose }: Props) {
  const payload = event.payload as Record<string, unknown> | null;
  const before = payload?.before ?? payload?.old_data ?? null;
  const after = payload?.after ?? payload?.new_data ?? payload?.changes ?? null;
  const evidence = payload?.evidence ?? payload?.reason ?? null;

  return (
    <div className="rounded border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start justify-between border-b border-gray-100 px-4 py-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-gray-900">{event.event_class}</span>
            <span
              className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${SEVERITY_COLORS[event.severity] ?? "bg-gray-100 text-gray-700"}`}
            >
              {event.severity.toUpperCase()}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {fmtDate(event.created_at)}
            {event.actor_email
              ? ` · ${event.actor_email}`
              : event.actor_user_id
                ? ` · uid:${event.actor_user_id.slice(0, 8)}…`
                : ""}
            {event.source ? ` · source: ${event.source}` : ""}
          </div>
          <div className="text-[11px] font-mono text-gray-400">id: {event.id}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-4 mt-0.5 rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          ✕
        </button>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-2">
        <PayloadSection label="Before" data={before} />
        <PayloadSection label="After / Changes" data={after} />
      </div>

      {evidence !== null && (
        <div className="border-t border-gray-100 px-4 pb-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Evidence / Reason</div>
          <div className="text-xs text-gray-700">{String(evidence)}</div>
        </div>
      )}

      <div className="border-t border-gray-100 px-4 pb-4 pt-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Full payload</div>
        <pre className="max-h-52 overflow-auto rounded border border-gray-100 bg-gray-50 p-2 text-[11px] leading-tight">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      </div>
    </div>
  );
}
