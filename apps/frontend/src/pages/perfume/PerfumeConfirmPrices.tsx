/**
 * L.30 item 11 (owner 2026-11-27 15:42 CT "Later: confirm new prices into lists"): with rows ticked on the desk, one
 * button writes each item's "My price @ my margin" (rounded up to the next $0.25) into my current offer list. Items
 * not on my list or without a calculated price are counted on screen, never guessed.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { confirmPerfumePrices, type PerfumeConfirmPricesResult } from "../../api/perfume";

export function ConfirmPricesButton({ itemIds, targetPct, earnPct }: { itemIds: string[]; targetPct?: number | null; earnPct?: number | null }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);
  const [res, setRes] = useState<PerfumeConfirmPricesResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await confirmPerfumePrices({ item_ids: itemIds, target_pct: targetPct ?? null, earn_pct: earnPct ?? null });
      setRes(r); setAsked(false);
      await qc.invalidateQueries({ queryKey: ["perfume"] });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <span className="flex flex-wrap items-center gap-2" data-testid="perfume-confirm-prices">
      {asked ? (
        <>
          <span className="text-xs font-semibold text-[#1F2A44]">{`Write "My price @ my margin" into my list for ${itemIds.length} item(s)?`}</span>
          <button type="button" disabled={busy} onClick={() => void run()} data-testid="perfume-confirm-prices-yes"
            className="rounded-sm border border-[#1F2A44] bg-[#1F2A44] px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Yes, confirm"}</button>
          <button type="button" disabled={busy} onClick={() => setAsked(false)} className="rounded-sm border border-gray-300 bg-white px-2 py-0.5 text-xs font-semibold">Cancel</button>
        </>
      ) : (
        <button type="button" onClick={() => { setRes(null); setAsked(true); }} data-testid="perfume-confirm-prices-open"
          className="rounded-sm border border-[#1F2A44] bg-white px-2 py-0.5 text-xs font-semibold text-[#1F2A44]">Confirm prices into my list</button>
      )}
      {res ? (
        <span className="text-xs text-gray-700" data-testid="perfume-confirm-prices-result">
          {`${res.updated} price(s) written · ${res.unchanged} already at that price · ${res.not_on_my_list.length} not on my list · ${res.no_price.length} without a calculated price`}
        </span>
      ) : null}
      {err ? <span className="text-xs font-semibold text-red-700">{err}</span> : null}
    </span>
  );
}
