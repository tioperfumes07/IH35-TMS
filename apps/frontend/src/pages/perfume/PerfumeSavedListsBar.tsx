/** PERFUME-DESK — my saved lists. Owner 2026-11-19: "add function to save … the current lists and comparisons, and then add
 *  another function so i can switch between this one and the new testers one etc. offer 1, 2 3 or import 1-2-3 or by date."
 *  One picker per list of mine (offer list, inventory): every saved list by number, name and date; choosing one puts it in
 *  use on every tab. Nothing is deleted — the others stay saved and one click brings them back. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Combobox } from "../../components/Combobox";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { activatePerfumeSavedList, listPerfumeSavedLists, type PerfumeSavedList } from "../../api/perfume";
import { tr } from "./perfumeI18n";

const NONE = "__none__";
const KIND_WORD: Record<PerfumeSavedList["kind"], string> = { offer: "Offer", inventory: "Import" };
const KIND_TITLE: Record<PerfumeSavedList["kind"], string> = { offer: "My offer list", inventory: "My inventory / cost list" };

/** "Offer 2 · LISTA IVA testers · Nov 19 2026 · 108 lines" */
export function savedListLabel(s: PerfumeSavedList): string {
  const d = (x: string) => new Date(`${x}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const when = s.first_date === s.last_date ? d(s.first_date) : `${d(s.first_date)} – ${d(s.last_date)}`;
  return `${KIND_WORD[s.kind]} ${s.number} · ${s.name} · ${when} · ${s.lines.toLocaleString()} lines`;
}

export function PerfumeSavedListsBar() {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const q = useQuery({ queryKey: ["perfume", "saved-lists"], queryFn: listPerfumeSavedLists });
  const [busy, setBusy] = useState<string | null>(null);
  if (q.isError) return <div className="text-xs text-red-700" data-testid="perfume-saved-lists-error">{tr("perfume.saved.err", "Could not load my saved lists")}: {(q.error as Error)?.message}</div>;
  const saved = q.data?.saved ?? [];
  const vendors = [...new Map(saved.map((s) => [s.vendor_id, s])).values()].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "offer" ? -1 : 1));
  if (!vendors.length) return null;
  const choose = async (vendorId: string, key: string | null) => {
    setBusy(vendorId);
    try {
      await activatePerfumeSavedList(vendorId, key);
      await qc.invalidateQueries({ queryKey: ["perfume"] });
      const s = saved.find((x) => x.vendor_id === vendorId && x.key === key);
      pushToast(s ? `In use: ${savedListLabel(s)}` : "No list in use — the others stay saved", "success");
    } catch (e) { pushToast(userFacingApiError(e, "Not switched"), "error"); }
    finally { setBusy(null); }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-sm border border-gray-200 bg-white px-2 py-1.5" role="group" aria-label={tr("perfume.saved.aria", "My saved lists")} data-testid="perfume-saved-lists">
      <span className="text-xs font-semibold text-[#1F2A44]">{tr("perfume.saved.label", "My saved lists")}</span>
      {vendors.map((v) => {
        const mine = saved.filter((s) => s.vendor_id === v.vendor_id);
        const using = mine.find((s) => s.in_use);
        return (
          <label key={v.vendor_id} className="flex items-center gap-1 text-xs text-gray-600" data-testid={`perfume-saved-${v.kind}`}>
            {tr(`perfume.saved.kind.${v.kind}`, KIND_TITLE[v.kind])}
            <span className="w-[420px]">
              <Combobox ariaLabel={KIND_TITLE[v.kind]} size="sm" disabled={busy === v.vendor_id}
                value={using?.key ?? NONE}
                dataTestId={`perfume-saved-pick-${v.kind}`}
                onChange={(k) => { if (k) void choose(v.vendor_id, k === NONE ? null : k); }}
                options={[...[...mine].reverse().map((s) => ({ value: s.key, label: savedListLabel(s) })), { value: NONE, label: "None in use (keep all saved)" }]} />
            </span>
          </label>
        );
      })}
      <span className="text-xs text-gray-600">{tr("perfume.saved.help", "The list in use is the one every tab compares. The others stay saved — pick one to switch back.")}</span>
    </div>
  );
}
