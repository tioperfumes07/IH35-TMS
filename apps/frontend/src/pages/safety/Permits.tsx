import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { PermitsPage } from "./PermitsPage";
import { Form2290Filings } from "../compliance/Form2290Filings";
import { resolveApiUrl } from "../../api/client";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { userFacingApiError } from "../../lib/api-error-message";
import { ListErrorState } from "../../components/ListErrorState";

type Props = {
  operatingCompanyId: string;
};

type Form2290DeadlinePayload = {
  deadline?: string;
  days_remaining?: number;
  current_draft?: { filing_status?: string } | null;
  /* SAF-ORPH-04. The annual `deadline` is the July-first-use case (Aug 31, business-day shifted).
     Per IRS Form 2290 a vehicle is due the last day of the month following its first use — a truck
     placed in service in October is due Nov 30, not Aug 31. These fields carry the exceptions. */
  per_unit_deadlines?: Array<{ unit_id: string; unit_number: string; first_used_month: string; deadline: string }>;
  // LV-SAFETY-PERMITS-2290-MISSING-UNIT-PLAIN-TEXT — API returns {unit_id, unit_number} (same as Form2290Filings).
  // A string[] type + .join() after #8560 rendered "[object Object]" and blocked unit drills on Safety→Permits.
  units_missing_first_use?: Array<{ unit_id: string | null; unit_number: string | null }>;
};

async function fetchForm2290Deadline(companyId: string) {
  const res = await fetch(resolveApiUrl(`/api/v1/compliance/form-2290/upcoming-deadline?operating_company_id=${encodeURIComponent(companyId)}`),
    { credentials: "include" }
  );
  // SAF-PERMITS-DEADLINE-QUERY-ERROR: returning null on !res.ok made deadlineQ succeed with empty
  // data and the banner say "due date unavailable" — indistinguishable from a real missing deadline.
  if (!res.ok) throw new Error(`request_failed_${res.status}`);
  return res.json() as Promise<Form2290DeadlinePayload>;
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
  const perUnit = deadlineQ.data?.per_unit_deadlines ?? [];
  const missingFirstUse = deadlineQ.data?.units_missing_first_use ?? [];

  return (
    <div className="space-y-4">
      {deadlineQ.isError ? (
        <div data-testid="permits-2290-deadline-query-error">
          <ListErrorState status={0} message={userFacingApiError(deadlineQ.error, "Could not load Form 2290 deadline.")} onRetry={() => void deadlineQ.refetch()} />
        </div>
      ) : (
      <div className="rounded-sm border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <div className="font-semibold">
          {deadline ? `Form 2290 due ${deadline}` : "Form 2290 due date unavailable"}
        </div>
        <div className="mt-1">
          {typeof days === "number" ? `${days} days remaining` : "Annual HVUT filing"} · current status: {status}
        </div>
        {/* SAF-ORPH-04 — per-unit exceptions. Only units whose due date differs from the annual banner
            are listed; July first use is already covered above. Without this the Safety Permits tab
            silently understated the obligation for every vehicle first used after July. */}
        {perUnit.length > 0 ? (
          <div className="mt-2 border-t border-slate-200 pt-2">
            <span className="font-semibold text-slate-900">
              {perUnit.length} vehicle{perUnit.length === 1 ? "" : "s"} due on a different date
            </span>{" "}
            (first used outside July) ·{" "}
            {perUnit
              .slice()
              .sort((a, b) => a.deadline.localeCompare(b.deadline))
              .slice(0, 4)
              .map((u, idx) => (
                <span key={u.unit_id}>
                  {idx > 0 ? " · " : null}
                  <EntityLink kind="unit" id={u.unit_id} label={entityLabel(u.unit_number, u.unit_id, "Unit")} /> due {u.deadline}
                </span>
              ))}
            {perUnit.length > 4 ? ` · +${perUnit.length - 4} more` : ""}
          </div>
        ) : null}
        {missingFirstUse.length > 0 ? (
          <div className="mt-2 border-t border-slate-200 pt-2">
            <span className="font-semibold text-slate-900">
              {missingFirstUse.length} vehicle{missingFirstUse.length === 1 ? "" : "s"} missing a first-use date
            </span>{" "}
            — due date cannot be computed ·{" "}
            {missingFirstUse.slice(0, 6).map((unit, idx) => (
              <Fragment key={unit.unit_id ?? `unresolved-unit-${idx}`}>
                {idx > 0 ? ", " : ""}
                {unit.unit_id ? (
                  <EntityLink kind="unit" id={unit.unit_id} label={entityLabel(unit.unit_number, unit.unit_id, "Unit")} />
                ) : (
                  <span>{unit.unit_number ?? "Unit — not visible"}</span>
                )}
              </Fragment>
            ))}
            {missingFirstUse.length > 6 ? `, +${missingFirstUse.length - 6} more` : ""}
          </div>
        ) : null}
      </div>
      )}
      <Form2290Filings showModuleHeader={false} />
      <PermitsPage operatingCompanyId={operatingCompanyId} />
    </div>
  );
}
