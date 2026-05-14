import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getReportLibrary } from "../../api/reports";
import type { ScheduledReportCreatePayload } from "../../api/scheduled-reports";
import { createScheduledReport, testSendScheduledReport } from "../../api/scheduled-reports";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";

type Props = {
  open: boolean;
  onClose: () => void;
  operatingCompanyId: string;
  defaultEmail: string;
  onCreated: () => void;
};

export function ScheduleReportModal({ open, onClose, operatingCompanyId, defaultEmail, onCreated }: Props) {
  const { pushToast } = useToast();
  const libQuery = useQuery({
    queryKey: ["reports", "library", operatingCompanyId],
    queryFn: () => getReportLibrary(operatingCompanyId),
    enabled: Boolean(operatingCompanyId) && open,
  });
  const [reportId, setReportId] = useState("ar-aging");
  const [rangeType, setRangeType] = useState<"rolling" | "calendar">("rolling");
  const [rollingDays, setRollingDays] = useState(30);
  const [calendarPreset, setCalendarPreset] = useState<"current_month" | "prev_month" | "quarter">("current_month");
  const [minRevenueDollars, setMinRevenueDollars] = useState("");
  const [freqKind, setFreqKind] = useState<"daily" | "weekly" | "monthly" | "cron">("weekly");
  const [timeLocal, setTimeLocal] = useState("07:00");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [cronExpr, setCronExpr] = useState("0 7 * * 1");
  const [recipients, setRecipients] = useState(defaultEmail);
  const [cc, setCc] = useState("");
  const [format, setFormat] = useState<"pdf" | "xlsx" | "csv">("pdf");
  const [subjectTpl, setSubjectTpl] = useState("{report_name} · {period} · {company}");
  const [showCron, setShowCron] = useState(false);
  const [busy, setBusy] = useState(false);

  const libraryIds = useMemo(() => {
    const rows = libQuery.data ?? [];
    const base = rows.map((r) => r.id);
    const extras = [
      "cash-flow-overview",
      "settlement-summary",
      "customer-profitability",
      "profit-per-truck",
      "fuel-reconciliation",
      "maintenance-cost-per-unit",
      "ar-aging",
      "ap-aging",
    ];
    return [...new Set([...extras, ...base])];
  }, [libQuery.data]);

  function buildPayload(): ScheduledReportCreatePayload {
    const rec = recipients
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const ccList = cc
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const parameters: Record<string, unknown> = {
      range: { type: rangeType, rolling_days: rollingDays, calendar_preset: calendarPreset },
    };
    if (minRevenueDollars.trim() && reportId.includes("profit")) {
      parameters.min_revenue_cents = Math.round(Number(minRevenueDollars) * 100) || 0;
    }
    const frequency = showCron
      ? { kind: "cron" as const, time_local: timeLocal, cron: cronExpr }
      : freqKind === "daily"
        ? { kind: "daily" as const, time_local: timeLocal }
        : freqKind === "weekly"
          ? { kind: "weekly" as const, time_local: timeLocal, day_of_week: dayOfWeek }
          : { kind: "monthly" as const, time_local: timeLocal, day_of_month: dayOfMonth };

    return {
      operating_company_id: operatingCompanyId,
      report_id: reportId,
      name: reportId,
      parameters,
      frequency,
      recipients: rec.length ? rec : [defaultEmail].filter(Boolean),
      cc: ccList.length ? ccList : undefined,
      format,
      subject_template: subjectTpl,
    };
  }

  return (
    <Modal open={open} onClose={onClose} title="Schedule a report">
      <div className="max-h-[70vh] space-y-3 overflow-auto pr-1 text-sm">
        <label className="block text-xs text-gray-600">
          Report
          <select className="mt-1 h-9 w-full rounded border border-gray-300 px-2" value={reportId} onChange={(e) => setReportId(e.target.value)}>
            {libraryIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="rounded border border-gray-200 p-2">
          <legend className="px-1 text-xs font-semibold text-gray-700">Parameters</legend>
          <label className="mt-1 block text-xs text-gray-600">
            Date range type
            <select className="mt-1 h-9 w-full rounded border px-2" value={rangeType} onChange={(e) => setRangeType(e.target.value as typeof rangeType)}>
              <option value="rolling">Rolling window</option>
              <option value="calendar">Calendar preset</option>
            </select>
          </label>
          {rangeType === "rolling" ? (
            <label className="mt-2 block text-xs text-gray-600">
              Last days
              <input type="number" className="mt-1 h-9 w-full rounded border px-2" value={rollingDays} onChange={(e) => setRollingDays(Number(e.target.value))} />
            </label>
          ) : (
            <label className="mt-2 block text-xs text-gray-600">
              Preset
              <select className="mt-1 h-9 w-full rounded border px-2" value={calendarPreset} onChange={(e) => setCalendarPreset(e.target.value as typeof calendarPreset)}>
                <option value="current_month">Current month</option>
                <option value="prev_month">Previous month</option>
                <option value="quarter">Quarter</option>
              </select>
            </label>
          )}
          {reportId.includes("profit") ? (
            <label className="mt-2 block text-xs text-gray-600">
              Min revenue (USD)
              <input className="mt-1 h-9 w-full rounded border px-2" value={minRevenueDollars} onChange={(e) => setMinRevenueDollars(e.target.value)} placeholder="1000" />
            </label>
          ) : null}
        </fieldset>

        <fieldset className="rounded border border-gray-200 p-2">
          <legend className="px-1 text-xs font-semibold text-gray-700">Frequency</legend>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={showCron} onChange={(e) => setShowCron(e.target.checked)} />
            Advanced (cron)
          </label>
          {!showCron ? (
            <>
              <select className="mt-1 h-9 w-full rounded border px-2" value={freqKind} onChange={(e) => setFreqKind(e.target.value as typeof freqKind)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <label className="mt-2 block text-xs text-gray-600">
                Local time (HH:MM)
                <input className="mt-1 h-9 w-full rounded border px-2" value={timeLocal} onChange={(e) => setTimeLocal(e.target.value)} />
              </label>
              {freqKind === "weekly" ? (
                <label className="mt-2 block text-xs text-gray-600">
                  Day of week (0 Sun – 6 Sat)
                  <input type="number" min={0} max={6} className="mt-1 h-9 w-full rounded border px-2" value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} />
                </label>
              ) : null}
              {freqKind === "monthly" ? (
                <label className="mt-2 block text-xs text-gray-600">
                  Day of month
                  <input type="number" min={1} max={28} className="mt-1 h-9 w-full rounded border px-2" value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} />
                </label>
              ) : null}
            </>
          ) : (
            <>
              <label className="mt-1 block text-xs text-gray-600">
                Cron
                <input className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} />
              </label>
            </>
          )}
        </fieldset>

        <label className="block text-xs text-gray-600">
          Recipients (comma / newline)
          <textarea className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" rows={2} value={recipients} onChange={(e) => setRecipients(e.target.value)} />
        </label>
        <label className="block text-xs text-gray-600">
          CC (optional)
          <textarea className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" rows={2} value={cc} onChange={(e) => setCc(e.target.value)} />
        </label>

        <label className="block text-xs text-gray-600">
          Format
          <select className="mt-1 h-9 w-full rounded border px-2" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
            <option value="pdf">PDF</option>
            <option value="xlsx">XLSX</option>
            <option value="csv">CSV</option>
          </select>
        </label>

        <label className="block text-xs text-gray-600">
          Subject template
          <input className="mt-1 w-full rounded border px-2 py-1 text-xs" value={subjectTpl} onChange={(e) => setSubjectTpl(e.target.value)} />
        </label>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await testSendScheduledReport(operatingCompanyId, buildPayload());
                pushToast("Test send queued", "success");
              } catch {
                pushToast("Test send failed — backend may not be ready", "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            Test send
          </Button>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 pt-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await createScheduledReport(buildPayload());
              pushToast("Schedule created", "success");
              onCreated();
              onClose();
            } catch {
              pushToast("Create failed — see P6-T11201", "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          Save schedule
        </Button>
      </div>
    </Modal>
  );
}
