/**
 * Margins by group (owner 2026-11-27 15:40 CT): "when wanting to change my margin, i need to have filters for the changes. so i can set
 * different percentages for different products, exclusive, new launches, testers, mini, sets, etc. regular goods … these filters must
 * be added to all processes … the same for trading sell to my vendors and for their margins".
 * One small editor on the desk toolbar (every tab): per group, My margin % (target price + list-analysis minimum margin) and the %
 * vendors earn on Trading. Blank = the tab's own %. Saved to the desk rules; every tab recomputes. Prices it calculates round by the
 * desk's rounding rule (owner: up to the next $0.25).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { getPerfumeRules, putPerfumeRules, PERFUME_MARGIN_GROUPS, type PerfumeMarginGroup } from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { ctl } from "./perfumeDocParts";

type Draft = Record<PerfumeMarginGroup, { mine: string; earn: string }>;
const pctOrNull = (s: string): number | null | "bad" => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n < 100 ? n : "bad";
};

export function MarginGroupsEditor() {
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: ["perfume", "rules"], queryFn: getPerfumeRules });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const start = () => {
    const r = rules.data;
    const d = Object.fromEntries(PERFUME_MARGIN_GROUPS.map(([g]) => [g, {
      mine: r?.group_margins?.[g] == null ? "" : String(r.group_margins[g]),
      earn: r?.group_earn?.[g] == null ? "" : String(r.group_earn[g]),
    }])) as Draft;
    setDraft(d); setOpen(true);
  };
  const save = async () => {
    if (!draft) return;
    const gm: Partial<Record<PerfumeMarginGroup, number | null>> = {}, ge: Partial<Record<PerfumeMarginGroup, number | null>> = {};
    for (const [g, label] of PERFUME_MARGIN_GROUPS) {
      const m = pctOrNull(draft[g].mine), e = pctOrNull(draft[g].earn);
      if (m === "bad" || e === "bad") { pushToast(`${label}: a % from 0 to 99`, "error"); return; }
      gm[g] = m; ge[g] = e;
    }
    setBusy(true);
    try {
      await putPerfumeRules({ group_margins: gm, group_earn: ge });
      await Promise.all([qc.invalidateQueries({ queryKey: ["perfume", "rules"] }), qc.invalidateQueries({ queryKey: ["perfume", "grid"] })]);
      pushToast(tr("perfume.groups.saved", "Margins by group saved — every tab recomputes"), "success");
      setOpen(false);
    } catch (err) { pushToast(userFacingApiError(err, "Not saved"), "error"); } finally { setBusy(false); }
  };
  const set = Object.entries(rules.data?.group_margins ?? {}).filter(([, v]) => v != null).length;
  return (
    <div className="relative" data-testid="perfume-margin-groups">
      <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => (open ? setOpen(false) : start())} data-testid="perfume-margin-groups-open">
        {tr("perfume.groups.button", "Margins by group")}{set ? ` (${set})` : ""}
      </Button>
      {open && draft ? (
        <div className="absolute left-0 z-30 mt-1 w-[360px] space-y-2 rounded-[3px] border border-[#C6D1DC] bg-white p-3 text-xs shadow-lg" role="dialog" aria-label={tr("perfume.groups.button", "Margins by group")}>
          <div className="font-semibold text-[#1F2A44]">{tr("perfume.groups.title", "Margin % by group — blank = the tab's %")}</div>
          <div className="grid grid-cols-[1fr_90px_110px] items-center gap-x-2 gap-y-1 text-left" role="group" aria-label={tr("perfume.groups.title", "Margin % by group")}>
            <span className="font-medium text-[#5B6B82]">{tr("perfume.groups.group", "Group")}</span>
            <span className="font-medium text-[#5B6B82]">{tr("perfume.groups.mine", "My margin %")}</span>
            <span className="font-medium text-[#5B6B82]">{tr("perfume.groups.earn", "Vendors earn % (Trading)")}</span>
            {PERFUME_MARGIN_GROUPS.map(([g, label]) => (
              <div key={g} className="contents">
                <span>{label}</span>
                <input inputMode="decimal" className={`${ctl} w-[80px] text-right`} value={draft[g].mine} aria-label={`${label} — my margin %`} data-testid={`perfume-group-${g}-mine`}
                  onChange={(e) => setDraft({ ...draft, [g]: { ...draft[g], mine: e.target.value } })} />
                <input inputMode="decimal" className={`${ctl} w-[80px] text-right`} value={draft[g].earn} aria-label={`${label} — vendors earn %`} data-testid={`perfume-group-${g}-earn`}
                  onChange={(e) => setDraft({ ...draft, [g]: { ...draft[g], earn: e.target.value } })} />
              </div>
            ))}
          </div>
          <div className="text-[#5B6B82]">{tr("perfume.groups.hint", "Group = New launch / Exclusive (marked on the item), else Tester / Set / Mini (flags), else Regular. A % typed on the tab overrides every group.")}</div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" className="h-[30px] px-3 text-xs" onClick={() => setOpen(false)}>{tr("perfume.groups.cancel", "Cancel")}</Button>
            <Button type="button" className="h-[30px] px-3 text-xs" disabled={busy} onClick={() => void save()} data-testid="perfume-margin-groups-save">{tr("perfume.groups.save", "Save")}</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
