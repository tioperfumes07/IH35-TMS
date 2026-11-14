// Match my list ↔ competitor (owner 2026-11-13 night: "over 300 items not correctly mapped — have a review of my list so
// i can map or review"; 11-14: "showing my description name and la esperanza description name … so i can verify they
// are matched correctly"). Each item on my offer list with no competitor line linked: my wording + my price, then the
// competitor lines it most likely is, with their wording, price and why. "Link" sets that line to my item (the same
// confirm Review uses); nothing is linked unless the owner presses it.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirmPerfumeRow, getPerfumeMyUnlinked, type PerfumeLineCandidate } from "../../api/perfume";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";

const money = (c: number | null | undefined) => (c == null ? "—" : `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

type MatchRow = { key: string; first: boolean; item_id: string; display_name: string; my_desc: string | null; my_price_cents: number | null; cand: PerfumeLineCandidate | null };

export function PerfumeMatchMyListPanel() {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [q, setQ] = useState("");
  const data = useQuery({ queryKey: ["perfume", "my-unlinked"], queryFn: getPerfumeMyUnlinked });
  const link = useMutation({
    mutationFn: (v: { row_id: string; item_id: string }) => confirmPerfumeRow(v.row_id, { item_id: v.item_id }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["perfume"] }); pushToast("Linked.", "success"); },
    onError: (e) => pushToast(`Could not link: ${(e as Error).message}`, "error"),
  });
  if (data.isPending) return <div className="text-xs text-gray-600" role="status">Loading my list…</div>;
  if (data.isError) return <div className="text-xs text-red-700">Could not load: {(data.error as Error).message} <button type="button" className="underline" onClick={() => void data.refetch()}>Retry</button></div>;
  const d = data.data;
  const needle = q.trim().toUpperCase();
  const rows = needle ? d.rows.filter((r) => `${r.display_name} ${r.my_desc ?? ""} ${r.candidates.map((c) => c.description).join(" ")}`.toUpperCase().includes(needle)) : d.rows;
  const withCand = d.rows.filter((r) => r.candidates.length > 0).length;
  // One table row per proposed line; my item's cells show on its first row only (grouped, never re-sorted).
  const flat: MatchRow[] = rows.flatMap((r) => (r.candidates.length ? r.candidates : [null]).map((cand, i) => ({
    key: `${r.item_id}:${cand?.row_id ?? "none"}`, first: i === 0, item_id: r.item_id, display_name: r.display_name, my_desc: r.my_desc, my_price_cents: r.my_price_cents, cand })));
  return (
    <div className="space-y-2" data-testid="perfume-match-my-list">
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700" data-testid="perfume-match-counts">
        <span><strong>{d.total_mine}</strong> items on my list</span>
        <span><strong>{d.linked}</strong> linked to a competitor line</span>
        <span><strong>{d.unlinked}</strong> not linked</span>
        <span><strong>{withCand}</strong> of those have likely lines below</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search my item, my wording or theirs" aria-label="Search" className="h-[30px] w-72 rounded-sm border border-gray-300 px-2 text-xs" />
      </div>
      {/* TABLE_DATE_OMIT: one row per (my item, proposed competitor line) — a matching worklist, no per-row event date. */}
      <ParityTable<MatchRow>
        rows={flat}
        rowKey={(r) => r.key}
        rowClassName={(r) => (r.first ? "border-t-2 border-t-slate-500" : "")}
        storageKey="perfume-desk-match-my-list-v1"
        hidePager
        page={1}
        pageSize={Math.max(1, flat.length)}
        emptyText="Every item on my list is linked to a competitor line."
        columns={[
          { key: "display_name", label: "My item", sortable: false, allowWrap: true, minWidth: 220, render: (r) => (r.first ? <strong className="text-[#1F2A44]">{r.display_name}</strong> : "") },
          { key: "my_desc", label: "My description", sortable: false, allowWrap: true, minWidth: 200, render: (r) => (r.first ? r.my_desc ?? "—" : "") },
          { key: "my_price_cents", label: "My price", sortable: false, kind: "money", cellClass: "text-right tabular-nums", render: (r) => (r.first ? money(r.my_price_cents) : "") },
          { key: "their_desc", label: "Their description", sortable: false, allowWrap: true, minWidth: 240,
            render: (r) => (r.cand ? <>{r.cand.description} <span className="text-gray-500">· {r.cand.vendor}</span></> : <span className="text-gray-500">No competitor line looks like this item.</span>) },
          { key: "their_price", label: "Their price", sortable: false, kind: "money", cellClass: "text-right tabular-nums", render: (r) => (r.cand ? money(r.cand.price_cents) : "") },
          { key: "why", label: "Why proposed", sortable: false, allowWrap: true, minWidth: 260, render: (r) => r.cand?.why ?? "" },
        ]}
        rowActions={(r) => (r.cand ? (
          <button type="button" disabled={link.isPending} onClick={() => link.mutate({ row_id: r.cand!.row_id, item_id: r.item_id })}
            className="h-[26px] rounded-sm border border-[#1F2A44] px-2 text-xs font-semibold text-[#1F2A44] hover:bg-[#EEF2F7] disabled:opacity-50"
            aria-label={`Link ${r.cand.description} to ${r.display_name}`}>Link</button>
        ) : null)}
        rowActionsWidth={90}
      />
    </div>
  );
}
