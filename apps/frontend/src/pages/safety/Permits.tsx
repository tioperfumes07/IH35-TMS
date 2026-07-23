import { useQuery } from "@tanstack/react-query";
import { PermitsPage } from "./PermitsPage";
import { Form2290Filings } from "../compliance/Form2290Filings";
import { resolveApiUrl } from "../../api/client";

type Props = {
  operatingCompanyId: string;
};

async function fetchForm2290Deadline(companyId: string) {
  const res = await fetch(resolveApiUrl(`/api/v1/compliance/form-2290/upcoming-deadline?operating_company_id=${encodeURIComponent(companyId)}`),
    { credentials: "include" }
  );
  if (!res.ok) return null;
  return res.json() as Promise<{ deadline?: string; days_remaining?: number; current_draft?: { filing_status?: string } | null }>;
}

export function Permits({ operatingCompanyId }: Props) {
  const deadlineQ = useQuery({
    queryKey: ["compliance", "form-2290", "permits-banner", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => fetchForm2290Deadline(operatingCompanyId),
  });

  // SAF-F32: this was `?? "Aug 31"`. Combined with the base-less fetch (SAF-F06) the request
  // always failed, so the banner ALWAYS displayed a hardcoded federal filing date that no
  // endpoint had confirmed. A fabricated IRS deadline on a compliance screen is worse than no
  // date at all — when the real deadline is unavailable, say so.
  const deadline = deadlineQ.data?.deadline ?? null;
  const days = deadlineQ.data?.days_remaining;
  const status = deadlineQ.data?.current_draft?.filing_status ?? "none";

  return (
    <div className="space-y-4">
      <div className="rounded-sm border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <div className="font-semibold">
          {deadline ? `Form 2290 due ${deadline}` : "Form 2290 due date unavailable"}
        </div>
        <div className="mt-1">
          {typeof days === "number" ? `${days} days remaining` : "Annual HVUT filing"} · current status: {status}
        </div>
      </div>
      <Form2290Filings />
      <PermitsPage operatingCompanyId={operatingCompanyId} />
    </div>
  );
}
