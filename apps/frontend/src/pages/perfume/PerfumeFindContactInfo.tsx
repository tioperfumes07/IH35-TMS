/**
 * Leads with no email or phone (owner 2026-11-28 14:24–14:26 CT: "if it is a lead it is because you got the contact information …
 * research in google linkedin etc … the contacts for all those leads"). One button looks every one of them up — Google Places on
 * the company's own name + address, then its website's home and contact pages for an email — 10 companies per call until none
 * are left, filling blanks on the same company only. Each company's history says what was found and where.
 */
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { findPerfumeContactInfo, getPerfumeNoContactInfo, type PerfumeFindContactInfoResult } from "../../api/perfume";
import { userFacingApiError } from "../../lib/api-error-message";

type Tally = Pick<PerfumeFindContactInfoResult, "looked_up" | "phone" | "website" | "email" | "no_match" | "nothing" | "error">;
const ZERO: Tally = { looked_up: 0, phone: 0, website: 0, email: 0, no_match: 0, nothing: 0, error: 0 };

export function PerfumeFindContactInfo({ onChanged }: { onChanged: () => void }) {
  const qc = useQueryClient();
  const info = useQuery({ queryKey: ["perfume", "no-contact-info"], queryFn: getPerfumeNoContactInfo });
  const [tally, setTally] = useState<Tally | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const stop = useRef(false);
  if (!info.data || (info.data.total === 0 && !tally)) return null;
  const left = info.data.total - info.data.looked_up;
  const run = async () => {
    stop.current = false; setRunning(true); setErr(null);
    let sum = { ...ZERO };
    const since = new Date().toISOString();
    try {
      for (;;) {
        const r = await findPerfumeContactInfo({ limit: 10, since });
        sum = { looked_up: sum.looked_up + r.looked_up, phone: sum.phone + r.phone, website: sum.website + r.website, email: sum.email + r.email,
          no_match: sum.no_match + r.no_match, nothing: sum.nothing + r.nothing, error: sum.error + r.error };
        setTally(sum);
        qc.setQueryData(["perfume", "no-contact-info"], { configured: true, ...r.remaining });
        if (r.looked_up === 0 || stop.current) break;
      }
    } catch (e) { setErr(userFacingApiError(e, "Lookup stopped")); }
    finally { setRunning(false); onChanged(); void info.refetch(); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-[#E5E7EB] bg-white px-3 py-2 text-xs" data-testid="perfume-find-contact-info">
      <span className="font-semibold text-[#8A4208]">{`${info.data.total.toLocaleString("en-US")} companies have no email or phone`}</span>
      <span className="text-[#64748B]">{left > 0 ? `· ${left.toLocaleString("en-US")} not looked up yet` : "· all looked up — the rest are not on Google"}</span>
      {!info.data.configured ? <span className="text-red-700">Google key is not set on the server</span> : running
        ? <Button type="button" variant="secondary" className="h-[30px] px-3 text-xs" onClick={() => { stop.current = true; }}>Stop</Button>
        : left > 0 ? <Button type="button" className="h-[30px] px-3 text-xs" onClick={() => void run()} data-testid="perfume-find-contact-info-run">Find their contact info (Google + website)</Button> : null}
      {tally ? <span data-testid="perfume-find-contact-info-tally">{`${running ? "Looking up… " : ""}${tally.looked_up} looked up · ${tally.phone} phone · ${tally.website} website · ${tally.email} email · ${tally.no_match} not found on Google${tally.error ? ` · ${tally.error} errors` : ""}`}</span> : null}
      {err ? <b className="text-red-700">{err}</b> : null}
    </div>
  );
}
