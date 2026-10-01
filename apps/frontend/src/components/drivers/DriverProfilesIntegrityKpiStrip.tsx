/**
 * C-57 — fleet Integrity + Complaints KPI tiles on /drivers/profiles (tiles across, never bars).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { countedComplaints, listDriverIntegrityProfiles } from "../../api/driver-integrity";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { colors } from "../../design/tokens";
import { KpiCard } from "../layout/KpiCard";
import { KpiStrip } from "../layout/KpiStrip";
import { ListErrorState } from "../ListErrorState";

export function DriverProfilesIntegrityKpiStrip() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const q = useQuery({
    queryKey: ["maintenance", "integrity", "driver-profiles", companyId],
    queryFn: () => listDriverIntegrityProfiles(companyId),
    enabled: Boolean(companyId),
  });

  const totals = useMemo(() => {
    const rows = q.isError ? [] : q.data?.rows ?? [];
    let findings = 0;
    let suspicions = 0;
    let complaints = 0;
    let driversWithSignal = 0;
    for (const row of rows) {
      driversWithSignal += 1;
      findings += row.score.findings;
      suspicions += row.score.suspicions;
      complaints += countedComplaints(row);
    }
    return { findings, suspicions, complaints, driversWithSignal, profileCount: rows.length };
  }, [q.data?.rows, q.isError]);

  if (q.isError) {
    return (
      <div data-testid="drivers-profiles-integrity-kpi-error" data-c57-integrity-kpis="error">
        <ListErrorState
          title="Couldn't load integrity KPIs"
          status={0}
          message={(q.error as Error)?.message}
          onRetry={() => void q.refetch()}
        />
      </div>
    );
  }

  return (
    <div data-testid="drivers-profiles-integrity-kpi-strip" data-c57-integrity-kpis="true">
      <KpiStrip>
        <KpiCard
          label="Integrity findings"
          number={q.isLoading ? "…" : String(totals.findings)}
          accent={totals.findings > 0 ? colors.crit.strong : colors.positive.strong}
          disabled
          disabledReason="Drill-down filter for findings not shipped yet"
        />
        <KpiCard
          label="Integrity suspicions"
          number={q.isLoading ? "…" : String(totals.suspicions)}
          accent={totals.suspicions > 0 ? colors.warn.strong : colors.info.strong}
          disabled
          disabledReason="Drill-down filter for suspicions not shipped yet"
        />
        <KpiCard
          label="Complaints"
          number={q.isLoading ? "…" : String(totals.complaints)}
          accent={totals.complaints > 0 ? colors.warn.strong : colors.positive.strong}
          to="/safety/complaints"
        />
        <KpiCard
          label="Drivers with signal"
          number={q.isLoading ? "…" : String(totals.driversWithSignal)}
          accent={colors.drivers.strong}
          disabled
          disabledReason="Drivers-with-signal list filter not shipped yet"
        />
      </KpiStrip>
    </div>
  );
}
