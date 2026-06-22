import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { acknowledgeSafetyReminder, listSafetyReminders } from "../../../api/safety";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { ExpiryDashboard } from "../expiry-tracking/ExpiryDashboard";

type DotReferenceCard = {
  cfr: string;
  title: string;
  cadence: string;
  sourceType: string;
  summary: string;
};

const DOT_REFERENCE_CARDS: DotReferenceCard[] = [
  {
    cfr: "49 CFR 391.51",
    title: "Driver Qualification File",
    cadence: "At hire + ongoing updates",
    sourceType: "driver_qualification",
    summary: "Maintain complete DQ file documents for each active CMV driver and retain records by policy.",
  },
  {
    cfr: "49 CFR 391.43/391.45",
    title: "Medical Examiner Certificate",
    cadence: "Before expiration",
    sourceType: "medical_card",
    summary: "Track expiration risk and keep each driver medically certified before dispatch assignment.",
  },
  {
    cfr: "49 CFR 391.23/391.25",
    title: "Background & MVR Reviews",
    cadence: "At hire + annual review",
    sourceType: "background_check",
    summary: "Complete required background checks and annual MVR qualification reviews for active drivers.",
  },
  {
    cfr: "49 CFR 382.305",
    title: "Drug & Alcohol Program",
    cadence: "Program cycle",
    sourceType: "training_record",
    summary: "Monitor random testing and compliance training so overdue obligations trigger follow-up reminders.",
  },
] as const;

function tierClass(severity: string) {
  if (severity === "expired") return "bg-red-50 text-red-800";
  if (severity === "critical") return "bg-amber-50 text-amber-900";
  return "bg-slate-100 text-slate-700";
}

function sourceLabel(sourceType: string) {
  if (sourceType === "driver_qualification") return "DQ File";
  if (sourceType === "medical_card") return "Medical Card";
  if (sourceType === "background_check") return "Background / MVR";
  if (sourceType === "training_record") return "Training";
  return sourceType;
}

function severityWeight(severity: string) {
  if (severity === "expired") return 0;
  if (severity === "critical") return 1;
  return 2;
}

export function DOTComplianceTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();

  const remindersQ = useQuery({
    queryKey: ["safety", "reminders", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listSafetyReminders(companyId).then((payload) => payload.reminders),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (reminderId: string) => acknowledgeSafetyReminder(reminderId, companyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety", "reminders", companyId] });
    },
  });

  if (!companyId) {
    return <div className="rounded border border-gray-200 bg-white p-4 text-xs text-slate-600">Select an operating company.</div>;
  }

  const reminders = remindersQ.data ?? [];
  const orderedReminders = useMemo(
    () =>
      [...reminders].sort((a, b) => {
        const sevDiff = severityWeight(a.severity) - severityWeight(b.severity);
        if (sevDiff !== 0) return sevDiff;
        return a.days_to_expiry - b.days_to_expiry;
      }),
    [reminders]
  );
  const sourceCounters = useMemo(() => {
    const counters = new Map<string, number>();
    for (const row of orderedReminders) {
      const source = String(row.source_type ?? "");
      counters.set(source, (counters.get(source) ?? 0) + 1);
    }
    return counters;
  }, [orderedReminders]);

  return (
    <div className="space-y-4">
      <ExpiryDashboard />

      <div className="rounded border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Compliance Reminders Panel</h2>
            <p className="mt-1 text-xs text-slate-600">Open reminders generated from DQF, medical cards, and related compliance records.</p>
          </div>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">Open {orderedReminders.length}</span>
        </div>
        {remindersQ.isLoading ? (
          <p className="mt-3 text-xs text-slate-500">Loading reminders...</p>
        ) : null}
        {remindersQ.error ? (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">Could not load reminders. Try again.</p>
        ) : null}
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[860px] w-full text-left text-xs">
            <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
              <tr>
                <th className="px-2 py-1">Driver</th>
                <th className="px-2 py-1">Item</th>
                <th className="px-2 py-1">Due</th>
                <th className="px-2 py-1">Days</th>
                <th className="px-2 py-1">Severity</th>
                <th className="px-2 py-1">Source</th>
                <th className="px-2 py-1">Action</th>
              </tr>
            </thead>
            <tbody>
              {orderedReminders.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-2 py-1">{row.driver_name ?? row.driver_id.slice(0, 8)}</td>
                  <td className="px-2 py-1">{row.item_name}</td>
                  <td className="px-2 py-1">{row.due_date}</td>
                  <td className="px-2 py-1">{row.days_to_expiry}</td>
                  <td className="px-2 py-1">
                    <span className={`rounded px-2 py-0.5 ${tierClass(row.severity)}`}>{row.severity}</span>
                  </td>
                  <td className="px-2 py-1">{sourceLabel(row.source_type)}</td>
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-0.5 text-[11px] disabled:opacity-50"
                      disabled={acknowledgeMutation.isPending || remindersQ.isLoading}
                      onClick={() => acknowledgeMutation.mutate(row.id)}
                    >
                      Dismiss
                    </button>
                  </td>
                </tr>
              ))}
              {!remindersQ.isLoading && orderedReminders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-3 text-center text-slate-500">
                    No open reminders.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {DOT_REFERENCE_CARDS.map((card) => (
          <article key={card.cfr} className="rounded border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{card.title}</h3>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{card.cfr}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-700">{card.summary}</p>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
              <span>Cadence: {card.cadence}</span>
              <span>Open: {sourceCounters.get(card.sourceType) ?? 0}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
