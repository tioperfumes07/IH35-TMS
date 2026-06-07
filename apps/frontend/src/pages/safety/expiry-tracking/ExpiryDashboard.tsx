import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../../api/client";
import { useCompanyContext } from "../../../contexts/CompanyContext";

type CertSeverity = "critical" | "warn" | "info";
type CertType = "cdl" | "medical_card" | "hazmat_endorsement" | "twic" | "passport" | "drug_test";

type CertExpiryAlert = {
  driver_uuid: string;
  driver_name: string;
  cert_type: CertType;
  cert_label: string;
  expiry_date: string;
  days_until_expiry: number;
  severity: CertSeverity;
};

type CertExpiryResponse = {
  alerts: CertExpiryAlert[];
};

const CERT_OPTIONS: Array<{ value: "all" | CertType; label: string }> = [
  { value: "all", label: "All certs" },
  { value: "cdl", label: "CDL" },
  { value: "medical_card", label: "Medical Card" },
  { value: "hazmat_endorsement", label: "Hazmat Endorsement" },
  { value: "twic", label: "TWIC" },
  { value: "passport", label: "Passport" },
  { value: "drug_test", label: "Drug Test Due" },
];

const SEVERITY_OPTIONS: Array<{ value: "all" | CertSeverity; label: string }> = [
  { value: "all", label: "All severity" },
  { value: "critical", label: "Critical" },
  { value: "warn", label: "Warn" },
  { value: "info", label: "Info" },
];

function severityClassName(severity: CertSeverity) {
  if (severity === "critical") return "bg-red-100 text-red-700";
  if (severity === "warn") return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
}

function severityWeight(severity: CertSeverity) {
  if (severity === "critical") return 0;
  if (severity === "warn") return 1;
  return 2;
}

export function ExpiryDashboard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [certType, setCertType] = useState<"all" | CertType>("all");
  const [severity, setSeverity] = useState<"all" | CertSeverity>("all");

  const alertsQuery = useQuery({
    queryKey: ["safety", "cert-expiry", companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      apiRequest<CertExpiryResponse>(`/api/safety/cert-expiry/all?operating_company_id=${encodeURIComponent(companyId)}`).then(
        (payload) => payload.alerts
      ),
  });

  const rows = alertsQuery.data ?? [];
  const filteredRows = useMemo(
    () =>
      rows
        .filter((row) => (certType === "all" ? true : row.cert_type === certType))
        .filter((row) => (severity === "all" ? true : row.severity === severity))
        .sort((a, b) => {
          const sev = severityWeight(a.severity) - severityWeight(b.severity);
          if (sev !== 0) return sev;
          const day = a.days_until_expiry - b.days_until_expiry;
          if (day !== 0) return day;
          return a.driver_name.localeCompare(b.driver_name);
        }),
    [rows, certType, severity]
  );

  if (!companyId) {
    return <div className="rounded border border-slate-200 bg-white p-4 text-xs text-slate-600">Select an operating company.</div>;
  }

  return (
    <section className="space-y-3 rounded border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Certificate Expiry Dashboard</h3>
          <p className="text-xs text-slate-600">Track CDL, medical card, hazmat, TWIC, passport, and drug test due dates.</p>
        </div>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">Open {filteredRows.length}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-500">Cert:</span>
          <select className="rounded border border-slate-300 px-2 py-1" value={certType} onChange={(e) => setCertType(e.target.value as "all" | CertType)}>
            {CERT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-500">Severity:</span>
          <select
            className="rounded border border-slate-300 px-2 py-1"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as "all" | CertSeverity)}
          >
            {SEVERITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {alertsQuery.isLoading ? <p className="text-xs text-slate-500">Loading cert expiries...</p> : null}
      {alertsQuery.error ? <p className="text-xs text-red-600">Failed to load cert expiries.</p> : null}

      <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
            <tr>
              <th className="px-2 py-1">Driver</th>
              <th className="px-2 py-1">Certificate</th>
              <th className="px-2 py-1">Expiry</th>
              <th className="px-2 py-1">Days</th>
              <th className="px-2 py-1">Severity</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={`${row.driver_uuid}:${row.cert_type}:${row.expiry_date}`} className="border-t border-slate-100">
                <td className="px-2 py-1">{row.driver_name}</td>
                <td className="px-2 py-1">{row.cert_label}</td>
                <td className="px-2 py-1">{row.expiry_date}</td>
                <td className="px-2 py-1">{row.days_until_expiry}</td>
                <td className="px-2 py-1">
                  <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${severityClassName(row.severity)}`}>{row.severity}</span>
                </td>
              </tr>
            ))}
            {!alertsQuery.isLoading && filteredRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-center text-slate-500">
                  No expiring certificates in the selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
