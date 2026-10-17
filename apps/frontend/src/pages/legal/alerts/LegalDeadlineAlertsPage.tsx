import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { legalMattersApi, type LegalDeadlineAlert } from "../../../api/legal-matters";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { LegalModuleTabs } from "../LegalModuleTabs";
import { ListErrorState } from "../../../components/ListErrorState";
import { userFacingApiError } from "../../../lib/api-error-message";
import { formatDateTimeUS } from "../../../lib/formatDate";
import { DrillKpiCard } from "../../../components/layout/DrillKpiCard";
import { DatePicker } from "../../../components/forms/DatePicker";
import { SelectCombobox } from "../../../components/Combobox";
import { ParityTable } from "../../../components/parity/ParityTable";
import {
  applyUniversalDatePreset,
  QBO_DATE_PRESETS,
} from "../../../components/table/UniversalListToolbar";

const SEV: Record<string, string> = {
  critical: "bg-[#0F1219] text-white",
  warning: "bg-[#E5E7EB] text-[#0F1219]",
  info: "bg-[#F7F8FA] text-[#1F2A44]",
};

function daysLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "due today";
  return `${days}d`;
}

function dueDay(iso: string | null | undefined): string {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}

export function LegalDeadlineAlertsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preset, setPreset] = useState("custom");

  const q = useQuery({
    queryKey: ["legal", "deadline-alerts", companyId],
    queryFn: () => legalMattersApi.deadlineAlerts(companyId),
    enabled: Boolean(companyId),
  });
  const alerts = (q.data?.alerts ?? []) as LegalDeadlineAlert[];
  const summary = q.data?.summary;

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      const day = dueDay(a.due_at);
      if (!day) return !(from || to);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [alerts, from, to]);

  return (
    <div className="space-y-3">
      <PageHeader
        breadcrumb={["Legal", "Alerts"]}
        title="Legal deadline alerts"
        subtitle="Statute dates, matter deadlines, signature and attorney-review expiry — silent failure is a defect"
      />
      <LegalModuleTabs />
      {!companyId ? (
        <p className="text-xs text-gray-600">Select an operating company.</p>
      ) : q.isLoading ? (
        <p className="text-xs text-gray-600">Loading…</p>
      ) : q.isError ? (
        <ListErrorState
          status={0}
          message={userFacingApiError(q.error, "Could not load legal deadline alerts.")}
          onRetry={() => void q.refetch()}
        />
      ) : (
        <>
          <div className="grid gap-2 md:grid-cols-4">
            <DrillKpiCard size="md" label="Open alerts" value={summary?.total ?? 0} to="/legal/alerts" />
            <DrillKpiCard size="md" label="Critical" value={summary?.critical ?? 0} to="/legal/alerts" />
            <DrillKpiCard size="md" label="Warning" value={summary?.warning ?? 0} to="/legal/alerts" />
            <DrillKpiCard size="md" label="Overdue" value={summary?.overdue ?? 0} to="/legal/alerts" />
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-sm border border-[#E5E7EB] bg-white p-2">
            <label className="block text-xs">
              <span className="mb-1 block font-semibold uppercase text-[#4B5563]">Preset</span>
              <SelectCombobox
                className="h-[34px] rounded-sm border border-[#E5E7EB] px-2 text-xs"
                value={preset}
                onChange={(e) => {
                  const next = e.target.value;
                  setPreset(next);
                  const bounds = applyUniversalDatePreset(next);
                  if (bounds) {
                    setFrom(bounds.from);
                    setTo(bounds.to);
                  }
                }}
                data-testid="legal-alerts-date-preset"
              >
                {QBO_DATE_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </SelectCombobox>
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold uppercase text-[#4B5563]">Due from</span>
              <DatePicker
                value={from}
                onChange={(v) => {
                  setPreset("custom");
                  setFrom(v);
                }}
                className="h-[34px]"
                aria-label="Due from"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold uppercase text-[#4B5563]">Due to</span>
              <DatePicker
                value={to}
                onChange={(v) => {
                  setPreset("custom");
                  setTo(v);
                }}
                className="h-[34px]"
                aria-label="Due to"
              />
            </label>
            {(from || to) && (
              <button
                type="button"
                className="h-[34px] rounded-sm border border-[#E5E7EB] px-2 text-xs"
                onClick={() => {
                  setFrom("");
                  setTo("");
                  setPreset("custom");
                }}
              >
                Clear
              </button>
            )}
          </div>

          {/* 443.99 — the shared ParityTable (was a hand-rolled HTML table): sortable headers, gear, export. */}
          <ParityTable<LegalDeadlineAlert>
            title="Legal deadline alerts"
            rows={filtered}
            rowKey={(a) => a.alert_id}
            storageKey="legal-deadline-alerts"
            exportFilename="legal-deadline-alerts"
            suppressToolbarRange
            emptyText={
              alerts.length === 0
                ? "No open legal deadline or expiry alerts in the 90-day window."
                : "No alerts in the selected due date range."
            }
            columns={[
              {
                key: "severity",
                label: "Severity",
                sortable: true,
                sortValue: (a) => a.severity,
                render: (a) => (
                  <span className={`rounded-sm px-2 py-0.5 text-xs font-semibold capitalize ${SEV[a.severity] ?? SEV.info}`}>{a.severity}</span>
                ),
              },
              { key: "kind", label: "Kind", sortable: true, sortValue: (a) => a.kind, cellClass: "text-[#1F2A44]", render: (a) => a.kind.replaceAll("_", " ") },
              {
                key: "title",
                label: "Title",
                sortable: true,
                sortValue: (a) => a.title,
                allowWrap: true,
                render: (a) => (
                  <>
                    <div className="font-medium">{a.title}</div>
                    <div className="text-xs text-[#6B7280]">{a.subtitle}</div>
                  </>
                ),
              },
              {
                key: "due_at",
                label: "Due",
                sortable: true,
                minWidth: 132,
                sortValue: (a) => a.due_at,
                cellClass: "whitespace-nowrap tabular-nums",
                render: (a) => formatDateTimeUS(a.due_at),
              },
              { key: "days_until", label: "Days", kind: "number", sortable: true, sortValue: (a) => a.days_until, render: (a) => daysLabel(a.days_until) },
              {
                key: "href",
                label: "Link",
                sortable: false,
                render: (a) => (
                  <Link to={a.href} className="text-xs text-[#14314F] underline">
                    Open
                  </Link>
                ),
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
