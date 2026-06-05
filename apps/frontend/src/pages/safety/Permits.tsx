import { useQuery } from "@tanstack/react-query";
import { PermitsPage } from "./PermitsPage";
import { Form2290Filings } from "../compliance/Form2290Filings";

type Props = {
  operatingCompanyId: string;
};

async function fetchForm2290Deadline(companyId: string) {
  const res = await fetch(
    `/api/v1/compliance/form-2290/upcoming-deadline?operating_company_id=${encodeURIComponent(companyId)}`,
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

  const deadline = deadlineQ.data?.deadline ?? "Aug 31";
  const days = deadlineQ.data?.days_remaining;
  const status = deadlineQ.data?.current_draft?.filing_status ?? "none";

  return (
    <div className="space-y-4">
      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
        <div className="font-semibold">Form 2290 due {deadline}</div>
        <div className="mt-1">
          {typeof days === "number" ? `${days} days remaining` : "Annual HVUT filing"} · current status: {status}
        </div>
      </div>
      <Form2290Filings />
      <PermitsPage operatingCompanyId={operatingCompanyId} />
    </div>
  );
}
