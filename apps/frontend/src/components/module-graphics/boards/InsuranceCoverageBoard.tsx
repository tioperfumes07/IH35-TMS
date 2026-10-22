import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  getInsuranceSummary,
  listInsurancePolicies,
  type InsurancePolicy,
} from "../../../api/insurance";
import { ClickableStat } from "../ClickableStat";
import { ModBoardShell, ModSectionHead } from "../ModBoardShell";
import { formatUsdCents, isoDate } from "../format";

type Props = { companyId: string };

function daysBetween(a: string, b: string): number {
  const ms = new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime();
  return Math.round(ms / 86400000);
}

function policyLabel(p: InsurancePolicy): string {
  const t = String(p.coverage_type ?? p.policy_type ?? "Policy").replace(/_/g, " ");
  return t.toUpperCase();
}

/**
 * ROUND 443.248 — Insurance coverage board (LEAD-MOD-DESIGN-Insurance).
 * Live policies + summary; timeline fill = policy-year used.
 */
export function InsuranceCoverageBoard({ companyId }: Props) {
  const today = isoDate(new Date());
  const summaryQ = useQuery({
    queryKey: ["mod-graphics", "insurance-summary", companyId],
    queryFn: () => getInsuranceSummary(companyId).then((r) => r.summary),
    enabled: Boolean(companyId),
    retry: false,
  });
  const policiesQ = useQuery({
    queryKey: ["mod-graphics", "insurance-policies", companyId],
    queryFn: () => listInsurancePolicies({ operating_company_id: companyId, status: "active" }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const policies = policiesQ.data?.policies ?? [];
  const active = useMemo(
    () => policies.filter((p) => String(p.status).toLowerCase() === "active"),
    [policies]
  );
  const premium = active.reduce((s, p) => s + (p.total_premium_cents ?? 0), 0);
  const renewal = useMemo(() => {
    const ends = active
      .map((p) => p.expiry_date || p.end_date)
      .filter((d): d is string => Boolean(d))
      .sort();
    return ends[0] ?? null;
  }, [active]);
  const daysToRenewal = renewal ? daysBetween(today, renewal) : null;

  const openClaims = summaryQ.data?.open_claims ?? null;

  return (
    <ModBoardShell
      eyebrow="Insurance · USMCA · live"
      title="Insurance coverage"
      subtitle="Covered, until when, at what cost"
      testId="insurance-coverage-board"
    >
      <div className="mod-board__kpi-grid">
        <ClickableStat
          label="Active policies"
          value={policiesQ.isError ? "—" : String(active.length)}
          hint="auto liability · physical damage · cargo"
          to="/safety/insurance/policies"
          testId="ins-board-active"
        />
        <ClickableStat
          label="Annual premium"
          value={policiesQ.isError ? "—" : formatUsdCents(premium)}
          hint={active.length ? `sum of ${active.length} active policies` : "No active policies"}
          to="/safety/insurance/policies"
          testId="ins-board-premium"
        />
        <ClickableStat
          label="Renewal"
          value={policiesQ.isError ? "—" : renewal ? renewal : "—"}
          hint={daysToRenewal != null ? `${daysToRenewal} days` : "no expiry on file"}
          to="/safety/insurance/policies"
          testId="ins-board-renewal"
        />
        <ClickableStat
          label="Open claims"
          value={summaryQ.isError ? "—" : openClaims == null ? "…" : String(openClaims)}
          hint="real"
          to="/safety/insurance/claims"
          testId="ins-board-claims"
        />
      </div>

      <ModSectionHead title="Coverage timeline — what is covered, until when" viewAllTo="/safety/insurance/policies" />
      {policiesQ.isError ? (
        <div className="mod-empty">Insurance policies could not be loaded.</div>
      ) : active.length === 0 ? (
        <div className="mod-empty">No active policies on file yet.</div>
      ) : (
        <div className="space-y-2" data-testid="ins-board-timeline">
          {active.map((p) => {
            const start = p.effective_date || p.start_date || today;
            const end = p.expiry_date || p.end_date || today;
            const span = Math.max(1, daysBetween(start, end));
            const used = Math.min(span, Math.max(0, daysBetween(start, today)));
            const pct = Math.round((used / span) * 100);
            const to = `/safety/insurance/policies/${encodeURIComponent(p.id)}`;
            return (
              <Link
                key={p.id}
                to={to}
                className="block rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-2 no-underline hover:border-[#14213D]"
                data-mod-click-through="1"
                data-mod-click-to={to}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase text-[#14213D]">{policyLabel(p)}</div>
                    <div className="truncate text-[11px] text-[#6B7280]">
                      {[p.carrier_name, p.policy_number].filter(Boolean).join(" · ") || "Policy"}
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-[13px] font-semibold text-[#14213D]">
                    {formatUsdCents(p.total_premium_cents ?? 0)}
                  </div>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-sm bg-[#E9EDF2]">
                  <div className="h-full bg-[#2456C7]" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-0.5 text-[11px] text-[#6B7280]">
                  day {used} of {span}
                  {end ? ` · renew ${end}` : ""}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <ModSectionHead title={`Annual premium — ${formatUsdCents(premium)}`} viewAllTo="/safety/insurance/policies" />
      {active.length === 0 ? (
        <div className="mod-empty">Premium split appears when active policies are on file.</div>
      ) : (
        <div className="space-y-1" data-testid="ins-board-premium-split">
          {active.map((p) => {
            const share = premium > 0 ? ((p.total_premium_cents ?? 0) / premium) * 100 : 0;
            const to = `/safety/insurance/policies/${encodeURIComponent(p.id)}`;
            return (
              <Link
                key={`split-${p.id}`}
                to={to}
                className="flex items-center justify-between gap-2 no-underline"
                data-mod-click-through="1"
                data-mod-click-to={to}
              >
                <span className="text-[12px] text-[#14213D]">{policyLabel(p)}</span>
                <span className="font-mono text-[12px] text-[#14213D]">
                  {formatUsdCents(p.total_premium_cents ?? 0)} · {share.toFixed(1)}%
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </ModBoardShell>
  );
}
