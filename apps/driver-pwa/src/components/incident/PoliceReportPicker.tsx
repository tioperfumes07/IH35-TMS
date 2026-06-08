export type PoliceReportValue = {
  has_report: boolean;
  report_number: string;
  agency: string;
  officer_name: string;
  notes: string;
};

export function PoliceReportPicker({
  value,
  onChange,
  labels,
}: {
  value: PoliceReportValue;
  onChange: (next: PoliceReportValue) => void;
  labels: {
    title: string;
    has_report: string;
    no_report: string;
    report_number: string;
    agency: string;
    officer_name: string;
    notes: string;
  };
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-pwa-text-secondary">{labels.title}</div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...value, has_report: true })}
          className={`min-h-11 rounded-lg border px-3 py-2 text-sm ${value.has_report ? "border-[#3b82f6] text-[#bfdbfe]" : "border-pwa-border text-pwa-text-secondary"}`}
        >
          {labels.has_report}
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, has_report: false })}
          className={`min-h-11 rounded-lg border px-3 py-2 text-sm ${!value.has_report ? "border-[#3b82f6] text-[#bfdbfe]" : "border-pwa-border text-pwa-text-secondary"}`}
        >
          {labels.no_report}
        </button>
      </div>
      {value.has_report ? (
        <div className="space-y-2">
          <input
            type="text"
            value={value.report_number}
            onChange={(event) => onChange({ ...value, report_number: event.target.value })}
            className="h-10 w-full rounded border border-pwa-border bg-[#0d1320] px-2 text-sm text-pwa-text-primary"
            placeholder={labels.report_number}
          />
          <input
            type="text"
            value={value.agency}
            onChange={(event) => onChange({ ...value, agency: event.target.value })}
            className="h-10 w-full rounded border border-pwa-border bg-[#0d1320] px-2 text-sm text-pwa-text-primary"
            placeholder={labels.agency}
          />
          <input
            type="text"
            value={value.officer_name}
            onChange={(event) => onChange({ ...value, officer_name: event.target.value })}
            className="h-10 w-full rounded border border-pwa-border bg-[#0d1320] px-2 text-sm text-pwa-text-primary"
            placeholder={labels.officer_name}
          />
          <textarea
            value={value.notes}
            onChange={(event) => onChange({ ...value, notes: event.target.value })}
            className="min-h-20 w-full rounded border border-pwa-border bg-[#0d1320] p-2 text-sm text-pwa-text-primary"
            placeholder={labels.notes}
          />
        </div>
      ) : null}
    </div>
  );
}
