/**
 * Company names to fix (owner 2026-11-27 18:32 CT: "get this fixed now. for those unassigned comapny name i will assign, they
 * stay in the screen so i can assign"). Each supplier list's company in Contacts whose name is not the list's company — a
 * name made from an email domain ("Bsfragrances") or a person holding the supplier's email ("Andy Tilani" for Sushmaa).
 * Type the real name and Save, or "Name is right". A row leaves only when one of the two is saved (one history row each).
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { confirmPerfumeCompanyName, getPerfumeCompanyNameCheck, renamePerfumeCompany } from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { ctl, DocLink } from "./perfumeDocParts";

export function CompanyNameCheck() {
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["perfume", "company-name-check"], queryFn: getPerfumeCompanyNameCheck });
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => { const n: Record<string, string> = {}; for (const r of q.data?.rows ?? []) n[r.company_id] = r.proposed; setNames((old) => ({ ...n, ...old })); }, [q.data]);
  const rows = (q.data?.rows ?? []).filter((r, i, a) => a.findIndex((x) => x.company_id === r.company_id) === i);
  if (!rows.length) return null;
  const done = async (p: Promise<unknown>, msg: string) => {
    try { await p; pushToast(msg, "success"); await qc.invalidateQueries({ queryKey: ["perfume"] }); }
    catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
  };
  return (
    <section className="space-y-2 rounded-[3px] border border-[#C76A0A] bg-[#FFF8EF] p-3 text-xs" data-testid="perfume-company-name-check" aria-label={tr("perfume.names.title", "Company names to fix")}>
      <div className="text-section-header">{tr("perfume.names.title", "Company names to fix")} · {rows.length}</div>
      <div className="text-[#64748B]">{tr("perfume.names.help", "The company in Contacts has another name than its price list. Type the real company name and Save, or keep it with Name is right.")}</div>
      <div className="grid grid-cols-1 gap-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_minmax(0,3fr)]" role="list">
        {rows.map((r) => (
          <div key={r.company_id} role="listitem" className="contents" data-testid={`perfume-name-row-${r.company_id}`}>
            <div className="min-w-0 py-1 text-left font-semibold">{r.vendor}</div>
            <div className="min-w-0 py-1 text-left"><DocLink tab="vendors" id={r.company_id}>{r.company}</DocLink></div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 py-1">
              <input className={`${ctl} w-[280px] max-w-full`} value={names[r.company_id] ?? ""} aria-label={`${tr("perfume.names.real", "Real company name for")} ${r.vendor}`}
                onChange={(e) => setNames((n) => ({ ...n, [r.company_id]: e.target.value }))} data-testid={`perfume-name-input-${r.company_id}`} />
              <Button type="button" variant="primary" className="h-[28px] px-2 text-xs" disabled={!(names[r.company_id] ?? "").trim()}
                onClick={() => void done(renamePerfumeCompany(r.company_id, (names[r.company_id] ?? "").trim()), "Renamed")} data-testid={`perfume-name-save-${r.company_id}`}>{tr("perfume.names.save", "Save")}</Button>
              <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs"
                onClick={() => void done(confirmPerfumeCompanyName(r.company_id), "Kept")} data-testid={`perfume-name-ok-${r.company_id}`}>{tr("perfume.names.ok", "Name is right")}</Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
