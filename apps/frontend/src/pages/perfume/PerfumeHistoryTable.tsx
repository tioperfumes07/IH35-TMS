/**
 * PERFUME-LEAD-HISTORY — who changed what and when (fully-wired item g, owner 2026-11-26 18:13 CT). One table used on the
 * contact profile, the campaign editor and the trade detail; reads perfume.lead_events (append-only).
 */
import { ParityTable } from "../../components/parity/ParityTable";
import type { PerfumeLeadEvent } from "../../api/perfume";
import { tr } from "./perfumeI18n";

const DASH = "—";
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "short", timeStyle: "short" }) + " CT";
const ACTION_TEXT: Record<string, string> = {
  added: "Added", renamed: "Renamed", archived: "Archived", edited: "Edited", created: "Created", saved: "Saved", stage: "Stage moved",
  matched: "Buyer matched", taken_off: "Buyer taken off", scheduled: "Scheduled", send_started: "Sending started", stopped: "Stopped",
  attachment_added: "File attached", attachment_removed: "File removed", edited_in_excel: "Changed in Excel", archived_in_excel: "Removed in Excel",
  archived_removed_check: "Removed (Removed-Check list)", added_from_upload: "Added from an upload", joined_from_upload: "Upload joined this contact",
};
const fmt = (v: unknown): string => (v == null || v === "" ? DASH : Array.isArray(v) ? v.join("; ") : typeof v === "object" ? JSON.stringify(v) : String(v));
/** The changed fields in one line: "stage: offer_received → closed · customer type: Formal wholesale". */
export function eventDetail(e: Pick<PerfumeLeadEvent, "detail">): string {
  const d = e.detail ?? {};
  if ("from" in d && "to" in d) return `${fmt(d.from)} → ${fmt(d.to)}`;
  return Object.entries(d).filter(([k]) => k !== "trade_id").map(([k, v]) => `${k.replace(/_/g, " ")}: ${fmt(v)}`).join(" · ") || DASH;
}

export function PerfumeHistoryTable({ events, loading, storageKey, title, exportName }: { events: PerfumeLeadEvent[]; loading?: boolean; storageKey: string; title?: string; exportName: string }) {
  return (
    <ParityTable<PerfumeLeadEvent>
      cardTitle title={title ?? tr("perfume.history.title", "History — who changed what, when")}
      rows={events}
      rowKey={(e) => e.id}
      loading={loading}
      storageKey={storageKey}
      suppressToolbarSearch
      exportFilename={exportName}
      exportExcel
      emptyText="No change recorded yet."
      columns={[
        { key: "created_at", label: "When", sortable: true, render: (e) => when(e.created_at) },
        { key: "by_name", label: "Who", sortable: true, render: (e) => e.by_name ?? DASH },
        { key: "action", label: "What", sortable: true, render: (e) => ACTION_TEXT[e.action] ?? e.action },
        { key: "entity", label: "On", sortable: true, render: (e) => e.entity.replace(/_/g, " ") },
        { key: "detail", label: "Detail", render: (e) => eventDetail(e) },
      ]}
    />
  );
}
