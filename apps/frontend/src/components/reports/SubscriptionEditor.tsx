import { useEffect, useState } from "react";
import { Button } from "../Button";

export type SubscriptionFormValues = {
  report_slug: string;
  cadence: "daily" | "weekly" | "monthly" | "quarterly";
  day_of_week: number | null;
  day_of_month: number | null;
  time_of_day: string;
  timezone: string;
  recipient_emails: string[];
  delivery_format: "pdf" | "xlsx" | "html";
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (values: SubscriptionFormValues) => Promise<void>;
  initial?: Partial<SubscriptionFormValues>;
  reportOptions: Array<{ slug: string; label: string }>;
  saving?: boolean;
};

const CADENCE_OPTIONS = ["daily", "weekly", "monthly", "quarterly"] as const;
const FORMAT_OPTIONS = ["pdf", "xlsx", "html"] as const;
const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export function SubscriptionEditor({ open, onClose, onSave, initial, reportOptions, saving }: Props) {
  const [reportSlug, setReportSlug] = useState(initial?.report_slug ?? reportOptions[0]?.slug ?? "");
  const [cadence, setCadence] = useState<SubscriptionFormValues["cadence"]>(initial?.cadence ?? "weekly");
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(initial?.day_of_week ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState<number | null>(initial?.day_of_month ?? 1);
  const [timeOfDay, setTimeOfDay] = useState(initial?.time_of_day?.slice(0, 5) ?? "07:00");
  const [timezone, setTimezone] = useState(initial?.timezone ?? "America/Chicago");
  const [recipientsText, setRecipientsText] = useState((initial?.recipient_emails ?? []).join(", "));
  const [deliveryFormat, setDeliveryFormat] = useState<SubscriptionFormValues["delivery_format"]>(
    initial?.delivery_format ?? "pdf"
  );

  useEffect(() => {
    if (!open) return;
    setReportSlug(initial?.report_slug ?? reportOptions[0]?.slug ?? "");
    setCadence(initial?.cadence ?? "weekly");
    setDayOfWeek(initial?.day_of_week ?? 1);
    setDayOfMonth(initial?.day_of_month ?? 1);
    setTimeOfDay(initial?.time_of_day?.slice(0, 5) ?? "07:00");
    setTimezone(initial?.timezone ?? "America/Chicago");
    setRecipientsText((initial?.recipient_emails ?? []).join(", "));
    setDeliveryFormat(initial?.delivery_format ?? "pdf");
  }, [open, initial, reportOptions]);

  if (!open) return null;

  const handleSubmit = async () => {
    const recipient_emails = recipientsText
      .split(/[,\s;]+/)
      .map((v) => v.trim())
      .filter(Boolean);
    await onSave({
      report_slug: reportSlug,
      cadence,
      day_of_week: cadence === "weekly" ? dayOfWeek : null,
      day_of_month: cadence === "monthly" ? dayOfMonth : null,
      time_of_day: timeOfDay,
      timezone,
      recipient_emails,
      delivery_format: deliveryFormat,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex overflow-y-auto bg-black/40 p-4" data-testid="subscription-editor">
      <div className="mx-auto w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Edit subscription</h2>
        <div className="mt-4 space-y-3 text-sm">
          <label className="block">
            <span className="font-medium text-slate-700">Report</span>
            <select
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={reportSlug}
              onChange={(e) => setReportSlug(e.target.value)}
              disabled={Boolean(initial?.report_slug)}
            >
              {reportOptions.map((opt) => (
                <option key={opt.slug} value={opt.slug}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="font-medium text-slate-700">Cadence</span>
            <select
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={cadence}
              onChange={(e) => setCadence(e.target.value as SubscriptionFormValues["cadence"])}
            >
              {CADENCE_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          {cadence === "weekly" ? (
            <label className="block">
              <span className="font-medium text-slate-700">Day of week</span>
              <select
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={dayOfWeek ?? 1}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {cadence === "monthly" ? (
            <label className="block">
              <span className="font-medium text-slate-700">Day of month</span>
              <input
                type="number"
                min={1}
                max={31}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={dayOfMonth ?? 1}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
              />
            </label>
          ) : null}

          <label className="block">
            <span className="font-medium text-slate-700">Time (local)</span>
            <input
              type="time"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="font-medium text-slate-700">Timezone</span>
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="font-medium text-slate-700">Recipients</span>
            <textarea
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              rows={2}
              value={recipientsText}
              onChange={(e) => setRecipientsText(e.target.value)}
              placeholder="owner@example.com, accountant@example.com"
            />
          </label>

          <label className="block">
            <span className="font-medium text-slate-700">Delivery format</span>
            <select
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={deliveryFormat}
              onChange={(e) => setDeliveryFormat(e.target.value as SubscriptionFormValues["delivery_format"])}
            >
              {FORMAT_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void handleSubmit()}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
