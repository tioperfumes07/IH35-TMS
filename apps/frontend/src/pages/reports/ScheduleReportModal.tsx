import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getReportLibrary } from "../../api/reports";
import type { ScheduledReportCreatePayload } from "../../api/scheduled-reports";
import { createScheduledReport, getScheduledReport, testSendScheduledReport, updateScheduledReport } from "../../api/scheduled-reports";
import { Button } from "../../components/Button";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { SCHEDULABLE_REPORT_IDS, SCHEDULED_REPORT_LABELS } from "../../lib/scheduled-report-catalog";

type Props = {
  open: boolean;
  onClose: () => void;
  operatingCompanyId: string;
  defaultEmail: string;
  /** SCHEDULED-REPORTS-EDIT-BUTTON-OPENS-BLANK-CREATE-FORM-NOT-EDIT: when set, the modal fetches the
   * existing row, pre-fills every field from it, and Save calls PATCH instead of POST. */
  editId?: string | null;
  onCreated: () => void;
};

export function ScheduleReportModal({ open, onClose, operatingCompanyId, defaultEmail, editId, onCreated }: Props) {
  const { pushToast } = useToast();
  const isEdit = Boolean(editId);
  const libQuery = useQuery({
    queryKey: ["reports", "library", operatingCompanyId],
    queryFn: () => getReportLibrary(operatingCompanyId),
    enabled: Boolean(operatingCompanyId) && open,
  });
  const detailQuery = useQuery({
    queryKey: ["scheduled-report-detail", editId, operatingCompanyId],
    queryFn: () => getScheduledReport(editId as string, operatingCompanyId),
    enabled: Boolean(editId) && Boolean(operatingCompanyId) && open,
  });
  // GO-0045-SCHEDULED-REPORTS-UNSUPPORTED-REPORT-ID-SILENT-NEVER-SENDS: was "ar-aging" -- not
  // one of the 6 ids the delivery worker can actually generate, so a fresh "Schedule a new
  // report" that never touched this field defaulted straight into a silently-broken schedule.
  const [reportId, setReportId] = useState("dispatch-board");
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

  // SCHEDULED-REPORTS-EDIT-BUTTON-OPENS-BLANK-CREATE-FORM-NOT-EDIT: when opened in edit mode, seed every
  // field from the fetched raw row instead of leaving the hardcoded create-mode defaults in place.
  useEffect(() => {
    if (!open || !editId || !detailQuery.data) return;
    const row = detailQuery.data.record;
    const params = (row.report_params ?? {}) as Record<string, unknown>;
    const range = (params.range ?? {}) as Record<string, unknown>;
    setReportId(row.report_id);
    setRangeType(range.type === "calendar" ? "calendar" : "rolling");
    setRollingDays(typeof range.rolling_days === "number" ? range.rolling_days : 30);
    setCalendarPreset(
      range.calendar_preset === "prev_month" || range.calendar_preset === "quarter" ? range.calendar_preset : "current_month",
    );
    setMinRevenueDollars(typeof params.min_revenue_cents === "number" ? String(params.min_revenue_cents / 100) : "");
    if (row.frequency === "daily" || row.frequency === "weekly" || row.frequency === "monthly") {
      setShowCron(false);
      setFreqKind(row.frequency);
    } else {
      // "quarterly" (and any other non-editable-as-preset kind) has no dedicated UI here — surface it via
      // the cron field so the real cron_expression is visible and preserved rather than silently discarded.
      setShowCron(true);
    }
    setTimeLocal(row.run_time ? String(row.run_time).slice(0, 5) : "07:00");
    setDayOfWeek(row.run_day_of_week ?? 1);
    setDayOfMonth(row.run_day_of_month ?? 1);
    setCronExpr(row.cron_expression ?? "");
    setRecipients((row.recipients_to ?? []).join(", "));
    setCc((row.recipients_cc ?? []).join(", "));
    setFormat(row.format ?? "pdf");
    setSubjectTpl(row.subject_template ?? "{report_name} · {period} · {company}");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId, detailQuery.data]);

  // Reset to create-mode defaults each time the modal opens fresh for "+ Schedule a new report" — otherwise
  // a prior edit session's values would leak into the next create.
  useEffect(() => {
    if (!open || editId) return;
    // GO-0045: "ar-aging" is not one of the 6 actually-deliverable (SCHEDULABLE_REPORT_IDS) report ids —
    // resetting to it here re-created the same non-deliverable default this effect exists to guard against
    // every time the create-mode modal reopens, even after the initial useState default below was fixed.
    setReportId("dispatch-board");
    setRangeType("rolling");
    setRollingDays(30);
    setCalendarPreset("current_month");
    setMinRevenueDollars("");
    setFreqKind("weekly");
    setTimeLocal("07:00");
    setDayOfWeek(1);
    setDayOfMonth(1);
    setCronExpr("0 7 * * 1");
    setRecipients(defaultEmail);
    setCc("");
    setFormat("pdf");
    setSubjectTpl("{report_name} · {period} · {company}");
    setShowCron(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId]);

  // SCHEDULED-REPORTS-EDIT-REPORT-FIELD-BLANK-UNKNOWN-ID: sourced from the same shared catalog
  // ScheduledReportsPage.tsx uses for its list-row labels — previously this was its own independent,
  // narrower 8-id list that never learned about the 6 preset-driven ids (settlements-ready,
  // dispatch-board, etc.) real live schedules actually use, so editing one of those rows showed the
  // Report field blank ("Select...") even though every other field correctly pre-filled.
  const extraReports = useMemo(
    () => Object.entries(SCHEDULED_REPORT_LABELS).map(([id, name]) => ({ id, name })),
    [],
  );

  const libraryOptions = useMemo(() => {
    const rows = libQuery.data ?? [];
    const base = rows.map((r) => ({ id: r.id, name: r.name }));
    const seen = new Set(base.map((r) => r.id));
    const combined = [...base, ...extraReports.filter((e) => !seen.has(e.id))];
    // GO-0045-SCHEDULED-REPORTS-UNSUPPORTED-REPORT-ID-SILENT-NEVER-SENDS: `combined` above is
    // every report the app knows about, but the delivery worker can only actually generate the 6
    // ids in SCHEDULABLE_REPORT_IDS -- offering the rest let a user create a schedule that
    // silently never sends (no error until 3 failed delivery cycles). Restrict the picker to only
    // what's actually deliverable.
    const schedulable = combined.filter((o) => SCHEDULABLE_REPORT_IDS.has(o.id));
    // Belt-and-suspenders: if we're EDITING a row whose report_id predates this fix (or is
    // otherwise not in either catalog), still show it as an option rather than silently rendering
    // a blank select for a real, non-empty value -- the create/PATCH backend guard now prevents
    // any NEW unsupported schedule; this only preserves the Edit view for a pre-existing row.
    if (reportId && !schedulable.some((o) => o.id === reportId)) {
      const existing = combined.find((o) => o.id === reportId);
      schedulable.push(existing ?? { id: reportId, name: reportId });
    }
    return schedulable;
  }, [libQuery.data, extraReports, reportId]);

  const selectedReportName = libraryOptions.find((o) => o.id === reportId)?.name ?? reportId;

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
      name: selectedReportName,
      parameters,
      frequency,
      recipients: rec.length ? rec : [defaultEmail].filter(Boolean),
      cc: ccList.length ? ccList : undefined,
      format,
      subject_template: subjectTpl,
    };
  }

  return (
    <Modal variant="drawer" open={open} onClose={onClose} title={isEdit ? "Edit scheduled report" : "Schedule a report"}>
      <div className="max-h-[70vh] space-y-3 overflow-auto pr-1 text-sm">
        <label className="block text-xs text-gray-600">
          Report
          <SelectCombobox className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2" value={reportId} onChange={(e) => setReportId(e.target.value)}>
            {libraryOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </SelectCombobox>
        </label>

        <fieldset className="rounded-sm border border-gray-200 p-2">
          <legend className="px-1 text-xs font-semibold text-gray-700">Parameters</legend>
          <label className="mt-1 block text-xs text-gray-600">
            Date range type
            <SelectCombobox className="mt-1 h-9 w-full rounded-sm border px-2" value={rangeType} onChange={(e) => setRangeType(e.target.value as typeof rangeType)}>
              <option value="rolling">Rolling window</option>
              <option value="calendar">Calendar preset</option>
            </SelectCombobox>
          </label>
          {rangeType === "rolling" ? (
            <label className="mt-2 block text-xs text-gray-600">
              Last days
              <input type="number" className="mt-1 h-9 w-full rounded-sm border px-2" value={rollingDays} onChange={(e) => setRollingDays(Number(e.target.value))} />
            </label>
          ) : (
            <label className="mt-2 block text-xs text-gray-600">
              Preset
              <SelectCombobox className="mt-1 h-9 w-full rounded-sm border px-2" value={calendarPreset} onChange={(e) => setCalendarPreset(e.target.value as typeof calendarPreset)}>
                <option value="current_month">Current month</option>
                <option value="prev_month">Previous month</option>
                <option value="quarter">Quarter</option>
              </SelectCombobox>
            </label>
          )}
          {reportId.includes("profit") ? (
            <label className="mt-2 block text-xs text-gray-600">
              Min revenue (USD)
              {/* M-1: dollars-mode; Math.round(minRevenueDollars*100)=min_revenue_cents byte-for-byte. */}
              <MoneyInput valueDollars={minRevenueDollars ? Number(minRevenueDollars) : null} onChangeDollars={(d) => setMinRevenueDollars(d == null ? "" : String(d))} ariaLabel="Min revenue (USD)" className="mt-1 w-full" />
            </label>
          ) : null}
        </fieldset>

        <fieldset className="rounded-sm border border-gray-200 p-2">
          <legend className="px-1 text-xs font-semibold text-gray-700">Frequency</legend>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={showCron} onChange={(e) => setShowCron(e.target.checked)} />
            Advanced (cron)
          </label>
          {!showCron ? (
            <>
              <SelectCombobox className="mt-1 h-9 w-full rounded-sm border px-2" value={freqKind} onChange={(e) => setFreqKind(e.target.value as typeof freqKind)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </SelectCombobox>
              <label className="mt-2 block text-xs text-gray-600">
                Local time (HH:MM)
                <input className="mt-1 h-9 w-full rounded-sm border px-2" value={timeLocal} onChange={(e) => setTimeLocal(e.target.value)} />
              </label>
              {freqKind === "weekly" ? (
                <label className="mt-2 block text-xs text-gray-600">
                  Day of week (0 Sun – 6 Sat)
                  <input type="number" min={0} max={6} className="mt-1 h-9 w-full rounded-sm border px-2" value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} />
                </label>
              ) : null}
              {freqKind === "monthly" ? (
                <label className="mt-2 block text-xs text-gray-600">
                  Day of month
                  <input type="number" min={1} max={28} className="mt-1 h-9 w-full rounded-sm border px-2" value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} />
                </label>
              ) : null}
            </>
          ) : (
            <>
              <label className="mt-1 block text-xs text-gray-600">
                Cron
                <input className="mt-1 w-full rounded-sm border px-2 py-1 font-mono text-xs" value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} />
              </label>
            </>
          )}
        </fieldset>

        <label className="block text-xs text-gray-600">
          Recipients (comma / newline)
          <textarea className="mt-1 w-full rounded-sm border px-2 py-1 font-mono text-xs" rows={2} value={recipients} onChange={(e) => setRecipients(e.target.value)} />
        </label>
        <label className="block text-xs text-gray-600">
          CC (optional)
          <textarea className="mt-1 w-full rounded-sm border px-2 py-1 font-mono text-xs" rows={2} value={cc} onChange={(e) => setCc(e.target.value)} />
        </label>

        <label className="block text-xs text-gray-600">
          Format
          <SelectCombobox className="mt-1 h-9 w-full rounded-sm border px-2" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
            <option value="pdf">PDF</option>
            <option value="xlsx">XLSX</option>
            <option value="csv">CSV</option>
          </SelectCombobox>
        </label>

        <label className="block text-xs text-gray-600">
          Subject template
          <input className="mt-1 w-full rounded-sm border px-2 py-1 text-xs" value={subjectTpl} onChange={(e) => setSubjectTpl(e.target.value)} />
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
          disabled={isEdit && detailQuery.isLoading}
          onClick={async () => {
            setBusy(true);
            try {
              if (isEdit && editId) {
                await updateScheduledReport(editId, buildPayload());
                pushToast("Schedule updated", "success");
              } else {
                await createScheduledReport(buildPayload());
                pushToast("Schedule created", "success");
              }
              onCreated();
              onClose();
            } catch {
              pushToast(isEdit ? "Update failed — see P6-T11201" : "Create failed — see P6-T11201", "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          {isEdit ? "Save changes" : "Save schedule"}
        </Button>
      </div>
    </Modal>
  );
}
