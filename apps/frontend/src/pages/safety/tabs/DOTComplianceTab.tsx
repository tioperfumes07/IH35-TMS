import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { acknowledgeSafetyReminder, listSafetyReminders, type SafetyReminderRow } from "../../../api/safety";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { formatDateUS } from "../../../lib/formatDate";
import { ExpiryDashboard } from "../expiry-tracking/ExpiryDashboard";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { BackgroundChecksSection } from "../../../components/safety/BackgroundChecksSection";
import { MedicalCardsHistorySection } from "../../../components/safety/MedicalCardsHistorySection";
import { userFacingApiError } from "../../../lib/api-error-message";
import { ListErrorState } from "../../../components/ListErrorState";

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
  if (severity === "critical") return "bg-slate-50 text-slate-700";
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
  const actionGenerationRef = useRef(0);
  const [acknowledgeError, setAcknowledgeError] = useState<unknown>(null);

  const remindersQ = useQuery({
    queryKey: ["safety", "reminders", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listSafetyReminders(companyId).then((payload) => payload.reminders),
  });

  /** @matrix-built modules=safety cols=driver,connectivity,reverse_link */
  const acknowledgeMutation = useMutation({
    mutationFn: (input: { reminderId: string; companyId: string; generation: number }) =>
      acknowledgeSafetyReminder(input.reminderId, input.companyId),
    onMutate: () => setAcknowledgeError(null),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ["safety", "reminders", input.companyId] });
    },
    onError: (error, input) => {
      if (input.generation === actionGenerationRef.current) setAcknowledgeError(error);
    },
  });

  useEffect(() => {
    actionGenerationRef.current += 1;
    setAcknowledgeError(null);
    acknowledgeMutation.reset();
  }, [companyId]); // Mutation reset is stable; company transitions own a fresh reminder lifecycle.

  // Hooks must run unconditionally (Rules of Hooks). Early return AFTER all hooks.
  // SAF-F6991: React Query retains the last successful response after a failed
  // refetch. Compliance reminders drive counts and a destructive Dismiss
  // action, so failed reads must not leave that retained snapshot operable.
  const reminders = remindersQ.isError ? [] : remindersQ.data ?? [];
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

  const reminderColumns = useMemo<ParityColumn<SafetyReminderRow>[]>(
    () => [
      { key: "driver_name", label: "Driver", sortable: true, render: (row) => <EntityLink kind="driver" id={row.driver_id} label={entityLabel(row.driver_name, row.driver_id, "Driver")} /> },
      { key: "item_name", label: "Item", sortable: true },
      { key: "due_date", label: "Due", sortable: true, render: (row) => formatDateUS(row.due_date) },
      { key: "days_to_expiry", label: "Days", sortable: true },
      {
        key: "severity",
        label: "Severity",
        sortable: true,
        render: (row) => <span className={`rounded-sm px-2 py-0.5 ${tierClass(row.severity)}`}>{row.severity}</span>,
      },
      { key: "source_type", label: "Source", sortable: true, render: (row) => sourceLabel(row.source_type) },
      {
        key: "action",
        label: "Action",
        render: (row) => (
          <button
            type="button"
            className="rounded-sm border border-slate-300 px-2 py-0.5 text-[11px] disabled:opacity-50"
            disabled={acknowledgeMutation.isPending || remindersQ.isLoading || remindersQ.isError}
            onClick={() => acknowledgeMutation.mutate({ reminderId: row.id, companyId, generation: actionGenerationRef.current })}
          >
            Dismiss
          </button>
        ),
      },
    ],
    [acknowledgeMutation, remindersQ.isError, remindersQ.isLoading],
  );

  if (!companyId) {
    return <div className="rounded-sm border border-gray-200 bg-white p-4 text-xs text-slate-600">Select an operating company.</div>;
  }

  return (
    <div className="space-y-4">
      <ExpiryDashboard breadcrumbLabel="DOT Compliance" />
      <MedicalCardsHistorySection operatingCompanyId={companyId} />
      <BackgroundChecksSection operatingCompanyId={companyId} />

      <div className="rounded-sm border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Compliance Reminders Panel</h2>
            <p className="mt-1 text-xs text-slate-600">Open reminders generated from DQF, medical cards, and related compliance records.</p>
          </div>
          <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">Open {orderedReminders.length}</span>
        </div>
        <div className="mt-3">
          {remindersQ.isError ? (
            <ListErrorState
              title="Couldn't load compliance reminders"
              status={0}
              message={(remindersQ.error as Error)?.message}
              onRetry={() => void remindersQ.refetch()}
            />
          ) : (
            <ParityTable<SafetyReminderRow>
              columns={reminderColumns}
              rows={orderedReminders}
              rowKey={(row) => row.id}
              loading={remindersQ.isLoading}
              emptyText="No open reminders."
              storageKey="safety-dot-compliance-reminders"
              exportFilename="dot-compliance-reminders"
            />
          )}
        </div>
        {acknowledgeError ? (
          <p className="mt-2 text-xs text-red-700" data-testid="dot-compliance-dismiss-error">
            {userFacingApiError(acknowledgeError, "Could not dismiss the compliance reminder.")}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {DOT_REFERENCE_CARDS.map((card) => (
          <article key={card.cfr} className="rounded-sm border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{card.title}</h3>
              <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{card.cfr}</span>
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
