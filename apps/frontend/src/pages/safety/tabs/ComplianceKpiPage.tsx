import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listDrivers } from "../../../api/mdata";
import type { Driver } from "../../../types/api";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useSafetyUiContext } from "../SafetyLayout";
import { KpiCard } from "../../../components/layout/KpiCard";
import { KpiStrip } from "../../../components/layout/KpiStrip";

type SortKey =
  | "driver_name"
  | "status"
  | "compliance_label"
  | "issue_count"
  | "next_expiration_days"
  | "cdl_expires_at"
  | "dot_medical_expires_at"
  | "hazmat_endorsement_expires_at";
type SortDir = "asc" | "desc";

type ComplianceRow = {
  driver_id: string;
  driver_name: string;
  status: Driver["status"];
  cdl_expires_at: string | null;
  dot_medical_expires_at: string | null;
  hazmat_endorsement_expires_at: string | null;
  issue_count: number;
  compliance_label: "Compliant" | "Non-compliant";
  next_expiration_days: number | null;
  expiring_30_count: number;
  expired_count: number;
  issue_details: string[];
};

function daysUntil(dateIso: string | null | undefined): number | null {
  if (!dateIso) return null;
  const target = new Date(dateIso);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  return Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateIso: string | null | undefined) {
  if (!dateIso) return "—";
  const dt = new Date(dateIso);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString();
}

function buildComplianceRow(driver: Driver): ComplianceRow {
  const checks = [
    { label: "CDL", value: driver.cdl_expires_at },
    { label: "Medical card", value: driver.dot_medical_expires_at },
    { label: "Hazmat", value: driver.hazmat_endorsement_expires_at },
  ];
  const issueDetails: string[] = [];
  let expiring30 = 0;
  let expired = 0;
  let nextExpirationDays: number | null = null;

  for (const check of checks) {
    const days = daysUntil(check.value);
    if (days == null) {
      issueDetails.push(`${check.label}: missing`);
      continue;
    }
    if (days < 0) {
      issueDetails.push(`${check.label}: expired`);
      expired += 1;
    } else if (days <= 30) {
      issueDetails.push(`${check.label}: expiring soon`);
      expiring30 += 1;
    }
    if (nextExpirationDays == null || days < nextExpirationDays) {
      nextExpirationDays = days;
    }
  }

  return {
    driver_id: driver.id,
    driver_name: `${driver.first_name} ${driver.last_name}`.trim(),
    status: driver.status,
    cdl_expires_at: driver.cdl_expires_at,
    dot_medical_expires_at: driver.dot_medical_expires_at,
    hazmat_endorsement_expires_at: driver.hazmat_endorsement_expires_at,
    issue_count: issueDetails.length,
    compliance_label: issueDetails.length === 0 ? "Compliant" : "Non-compliant",
    next_expiration_days: nextExpirationDays,
    expiring_30_count: expiring30,
    expired_count: expired,
    issue_details: issueDetails,
  };
}

function statusPillClass(status: Driver["status"]) {
  if (status === "Active") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "Probation") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "OnLeave") return "bg-slate-50 text-slate-700 border-slate-200";
  if (status === "Terminated") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-gray-50 text-gray-700 border-gray-200";
}

export function ComplianceKpiPage() {
  const { selectedCompanyId } = useCompanyContext();
  const { filter, setDriverCounts } = useSafetyUiContext();
  const [showOnlyNonCompliant, setShowOnlyNonCompliant] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("driver_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const companyId = selectedCompanyId ?? "";

  const driversQuery = useQuery({
    queryKey: ["safety", "compliance-kpi", "drivers", companyId],
    queryFn: () => listDrivers({ operating_company_id: companyId }),
    enabled: Boolean(companyId),
  });

  const baseRows = useMemo(() => {
    const all = driversQuery.data?.drivers ?? [];
    const filteredDrivers =
      filter === "all"
        ? all
        : all.filter((driver) => driver.status === "Active" || driver.status === "Probation");
    return filteredDrivers.map(buildComplianceRow);
  }, [driversQuery.data?.drivers, filter]);

  const visibleRows = useMemo(() => {
    const filtered = showOnlyNonCompliant ? baseRows.filter((row) => row.compliance_label === "Non-compliant") : baseRows;
    const mul = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "driver_name" || sortKey === "status" || sortKey === "compliance_label") {
        return String(a[sortKey]).localeCompare(String(b[sortKey])) * mul;
      }
      const av = a[sortKey];
      const bv = b[sortKey];
      const aNum = av == null ? Number.POSITIVE_INFINITY : Number(av);
      const bNum = bv == null ? Number.POSITIVE_INFINITY : Number(bv);
      return (aNum - bNum) * mul;
    });
  }, [baseRows, showOnlyNonCompliant, sortDir, sortKey]);

  useEffect(() => {
    setDriverCounts(visibleRows.length, baseRows.length);
  }, [visibleRows.length, baseRows.length, setDriverCounts]);

  const kpis = useMemo(() => {
    const compliant = baseRows.filter((row) => row.compliance_label === "Compliant").length;
    const nonCompliant = baseRows.length - compliant;
    const expiring30 = baseRows.reduce((sum, row) => sum + row.expiring_30_count, 0);
    const expiredDocs = baseRows.reduce((sum, row) => sum + row.expired_count, 0);
    return {
      fleetDrivers: baseRows.length,
      compliant,
      nonCompliant,
      expiring30,
      expiredDocs,
    };
  }, [baseRows]);

  function changeSort(next: SortKey) {
    if (sortKey === next) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(next);
    setSortDir("asc");
  }

  function sortLabel(next: SortKey) {
    if (sortKey !== next) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  if (!companyId) {
    return (
      <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">
        Select an operating company to review compliance KPIs.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <KpiStrip>
        <KpiCard label="Fleet Drivers" number={kpis.fleetDrivers.toLocaleString()} />
        <KpiCard label="Compliant" number={kpis.compliant.toLocaleString()} accent="#16a34a" />
        <KpiCard label="Non-compliant" number={kpis.nonCompliant.toLocaleString()} accent="#dc2626" />
        <KpiCard label="Docs Expiring (30d)" number={kpis.expiring30.toLocaleString()} accent="#d97706" />
        <KpiCard label="Expired Docs" number={kpis.expiredDocs.toLocaleString()} accent="#b91c1c" />
      </KpiStrip>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-white px-3 py-2">
        <div className="text-xs text-slate-500">
          Driver compliance surface for dispatch safety checks. Sorted rows update instantly from driver master data.
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={showOnlyNonCompliant}
            onChange={(event) => setShowOnlyNonCompliant(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300"
          />
          Show only non-compliant drivers
        </label>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-2 py-2 text-left">
                <button type="button" onClick={() => changeSort("driver_name")} className="font-semibold">
                  Driver{sortLabel("driver_name")}
                </button>
              </th>
              <th className="px-2 py-2 text-left">
                <button type="button" onClick={() => changeSort("status")} className="font-semibold">
                  Status{sortLabel("status")}
                </button>
              </th>
              <th className="px-2 py-2 text-left">
                <button type="button" onClick={() => changeSort("compliance_label")} className="font-semibold">
                  Compliance{sortLabel("compliance_label")}
                </button>
              </th>
              <th className="px-2 py-2 text-left">
                <button type="button" onClick={() => changeSort("issue_count")} className="font-semibold">
                  Issues{sortLabel("issue_count")}
                </button>
              </th>
              <th className="px-2 py-2 text-left">
                <button type="button" onClick={() => changeSort("next_expiration_days")} className="font-semibold">
                  Next Expiration{sortLabel("next_expiration_days")}
                </button>
              </th>
              <th className="px-2 py-2 text-left">
                <button type="button" onClick={() => changeSort("cdl_expires_at")} className="font-semibold">
                  CDL Expires{sortLabel("cdl_expires_at")}
                </button>
              </th>
              <th className="px-2 py-2 text-left">
                <button type="button" onClick={() => changeSort("dot_medical_expires_at")} className="font-semibold">
                  Medical Expires{sortLabel("dot_medical_expires_at")}
                </button>
              </th>
              <th className="px-2 py-2 text-left">
                <button type="button" onClick={() => changeSort("hazmat_endorsement_expires_at")} className="font-semibold">
                  Hazmat Expires{sortLabel("hazmat_endorsement_expires_at")}
                </button>
              </th>
              <th className="px-2 py-2 text-left">Profile</th>
            </tr>
          </thead>
          <tbody>
            {driversQuery.isLoading ? (
              <tr>
                <td colSpan={9} className="px-2 py-3 text-center text-sm text-slate-500">
                  Loading compliance rows...
                </td>
              </tr>
            ) : null}
            {!driversQuery.isLoading &&
              visibleRows.map((row) => (
                <tr key={row.driver_id} className="border-t border-gray-100 align-top">
                  <td className="px-2 py-2 font-medium text-slate-900">{row.driver_name}</td>
                  <td className="px-2 py-2">
                    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${statusPillClass(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                        row.compliance_label === "Compliant"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-red-200 bg-red-50 text-red-700"
                      }`}
                    >
                      {row.compliance_label}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="font-semibold text-slate-900">{row.issue_count}</div>
                    {row.issue_details.length > 0 ? (
                      <div className="mt-1 text-[10px] text-slate-500">{row.issue_details.slice(0, 2).join(" · ")}</div>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    {row.next_expiration_days == null ? (
                      <span className="text-slate-400">—</span>
                    ) : row.next_expiration_days < 0 ? (
                      <span className="font-semibold text-red-700">{Math.abs(row.next_expiration_days)}d overdue</span>
                    ) : (
                      <span className={row.next_expiration_days <= 30 ? "font-semibold text-amber-700" : "text-slate-700"}>
                        {row.next_expiration_days}d
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2">{formatDate(row.cdl_expires_at)}</td>
                  <td className="px-2 py-2">{formatDate(row.dot_medical_expires_at)}</td>
                  <td className="px-2 py-2">{formatDate(row.hazmat_endorsement_expires_at)}</td>
                  <td className="px-2 py-2">
                    <Link className="font-medium text-blue-700 underline underline-offset-2" to={`/drivers/${row.driver_id}`}>
                      Open profile
                    </Link>
                  </td>
                </tr>
              ))}
            {!driversQuery.isLoading && visibleRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-2 py-4 text-center text-sm text-slate-500">
                  No drivers match the selected compliance filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
