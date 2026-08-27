import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCompanyViolations, getIntegrityAlerts, listAnomalies, type SafetyAnomalySubjectType } from "../../api/safety";
import { formatDateUS } from "../../lib/formatDate";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ListErrorState } from "../ListErrorState";
import { Button } from "../Button";

type SubjectKind = "driver" | "unit" | "vendor" | "customer" | "invoice";

export function SafetyAlertsReverseSection({ operatingCompanyId, subjectKind, subjectId }: {
  operatingCompanyId: string;
  subjectKind: SubjectKind;
  subjectId: string;
}) {
  const alertPageSize = 25;
  const [alertPage, setAlertPage] = useState(1);
  useEffect(() => setAlertPage(1), [operatingCompanyId, subjectKind, subjectId]);
  const companyViolationQ = useQuery({
    queryKey: ["safety-reverse", "company-violations", operatingCompanyId, subjectKind, subjectId],
    queryFn: () => getCompanyViolations(operatingCompanyId, {
      driver_id: subjectKind === "driver" ? subjectId : undefined,
      unit_id: subjectKind === "unit" ? subjectId : undefined,
    }),
    enabled: Boolean(operatingCompanyId && subjectId && (subjectKind === "driver" || subjectKind === "unit")),
  });
  const integrityAlertQ = useQuery({
    queryKey: ["safety-reverse", "integrity-alerts", operatingCompanyId, subjectKind, subjectId, alertPage],
    queryFn: () => getIntegrityAlerts(operatingCompanyId, {
      subject_driver_id: subjectKind === "driver" ? subjectId : undefined,
      subject_unit_id: subjectKind === "unit" ? subjectId : undefined,
      subject_vendor_id: subjectKind === "vendor" ? subjectId : undefined,
      limit: alertPageSize,
      offset: (alertPage - 1) * alertPageSize,
    }),
    enabled: Boolean(operatingCompanyId && subjectId && ["driver", "unit", "vendor"].includes(subjectKind)),
  });
  const anomalyQ = useQuery({
    queryKey: ["safety-reverse", "anomalies", operatingCompanyId, subjectKind, subjectId],
    queryFn: () => listAnomalies(operatingCompanyId, { subject: subjectKind as SafetyAnomalySubjectType, subject_id: subjectId }),
    enabled: Boolean(operatingCompanyId && subjectId && ["driver", "unit", "customer", "invoice"].includes(subjectKind)),
  });

  const loading = companyViolationQ.isLoading || integrityAlertQ.isLoading || anomalyQ.isLoading;
  const failed = companyViolationQ.isError || integrityAlertQ.isError || anomalyQ.isError;
  const violations = failed ? [] : (companyViolationQ.data?.company_violations ?? []);
  const alerts = failed ? [] : (integrityAlertQ.data?.integrity_alerts ?? []);
  const alertTotal = failed ? 0 : (integrityAlertQ.data?.total_count ?? 0);
  const alertPageCount = Math.max(1, Math.ceil(alertTotal / alertPageSize));
  const anomalies = failed ? [] : (anomalyQ.data?.anomalies ?? []);

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid={`safety-alerts-reverse-${subjectKind}`}>
      <h3 className="text-sm font-semibold text-slate-900">Safety alerts and violations</h3>
      {failed ? (
        <ListErrorState
          status={0}
          message="Related safety records could not be loaded."
          onRetry={() => void Promise.all([companyViolationQ.refetch(), integrityAlertQ.refetch(), anomalyQ.refetch()])}
        />
      ) : null}
      {!loading && !failed && violations.length + alerts.length + anomalies.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No safety alerts or company violations reference this record.</p>
      ) : null}
      <div className="mt-2 space-y-1 text-xs">
        {violations.map((row) => (
          <div key={`violation-${String(row.id)}`}>
            <EntityLinkOrTombstone
              kind="company_violation"
              id={row.id == null ? null : String(row.id)}
              name={`Company violation · ${String(row.violation_type ?? "Violation")}`}
              noun="Company violation"
              className="font-medium text-slate-700 hover:underline"
            />{" "}
            <span className="text-slate-500">{formatDateUS(row.reported_date)}</span>
          </div>
        ))}
        {alerts.map((row) => (
          <div key={`alert-${String(row.id)}`}>
            <EntityLinkOrTombstone
              kind="integrity_alert"
              id={row.id == null ? null : String(row.id)}
              name={`Integrity alert · ${String(row.alert_category ?? "Alert")}`}
              noun="Integrity alert"
              className="font-medium text-slate-700 hover:underline"
            />{" "}
            <span className="text-slate-500">{String(row.resolution_status ?? "unresolved")}</span>
          </div>
        ))}
        {anomalies.map((row) => (
          <div key={`anomaly-${row.id}`}>
            <EntityLink
              kind="integrity_anomaly"
              id={row.id}
              label={`Anomaly · ${row.anomaly_type}`}
              className="font-medium text-slate-700 hover:underline"
            />{" "}
            <span className="text-slate-500">{row.status}</span>
          </div>
        ))}
      </div>
      {!failed && alertTotal > alertPageSize ? (
        <div className="mt-2 flex items-center justify-end gap-2 text-xs" data-testid={`safety-alerts-reverse-pager-${subjectKind}`}>
          <Button size="sm" variant="secondary" disabled={alertPage <= 1 || integrityAlertQ.isFetching} onClick={() => setAlertPage((current) => Math.max(1, current - 1))}>Previous alerts</Button>
          <span className="text-slate-600">Page {alertPage} of {alertPageCount} · {alertTotal} alerts</span>
          <Button size="sm" variant="secondary" disabled={alertPage >= alertPageCount || integrityAlertQ.isFetching} onClick={() => setAlertPage((current) => Math.min(alertPageCount, current + 1))}>Next alerts</Button>
        </div>
      ) : null}
    </section>
  );
}
