import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";

// NEW-29/30/31 (owner 2026-09-08, verbatim): "every reefer load must confirm lumper receipts
// sent; dispatch flow must ask on reefer loads whether there's a lumper, who's paying, and if a
// customer is paying, whether that customer gets invoiced too, all confirmed by a click; if a
// driver is late, the app must always ask whether there's a penalty."
//
// Click-confirm only — every answer round-trips through completion-prompts.routes.ts and is
// re-read on the next open, same pattern as every other office confirm control in this drawer.
// Renders nothing when there is nothing to ask (not reefer AND not late) — a load with neither
// condition gets no extra chrome.

type Props = {
  loadId: string;
  operatingCompanyId: string;
};

type CompletionPrompts = {
  is_reefer: boolean;
  has_lumper: boolean;
  lumper_paid_by: string | null;
  lumper_receipts_sent: boolean | null;
  lumper_receipts_sent_at: string | null;
  invoice_customer_for_lumper: boolean | null;
  late_stops: Array<{ stop_id: string; stop_type: string; sequence: number; minutes_late: number }>;
  late_penalty_decided: boolean | null;
  late_penalty_decided_at: string | null;
  late_penalty_note: string | null;
};

const LUMPER_PAID_BY_LABEL: Record<string, string> = {
  carrier: "Carrier",
  shipper: "Shipper",
  broker: "Broker",
  receiver: "Receiver",
};

function ConfirmButtons({
  label,
  value,
  onChoose,
  disabled,
}: {
  label: string;
  value: boolean | null;
  onChoose: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-slate-700">{label}</span>
      <span className="flex gap-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChoose(true)}
          className={`rounded border px-2 py-0.5 text-xs font-semibold ${
            value === true ? "border-slate-600 bg-slate-100 text-slate-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChoose(false)}
          className={`rounded border px-2 py-0.5 text-xs font-semibold ${
            value === false ? "border-slate-600 bg-slate-200 text-slate-800" : "border-slate-300 text-slate-600 hover:bg-slate-50"
          }`}
        >
          No
        </button>
      </span>
    </div>
  );
}

export function LoadCompletionPromptsCard({ loadId, operatingCompanyId }: Props) {
  const queryClient = useQueryClient();

  const promptsQuery = useQuery({
    queryKey: ["dispatch-completion-prompts", loadId, operatingCompanyId],
    queryFn: () =>
      apiRequest<CompletionPrompts>(
        `/api/v1/dispatch/loads/${encodeURIComponent(loadId)}/completion-prompts?operating_company_id=${encodeURIComponent(
          operatingCompanyId
        )}`
      ),
    enabled: Boolean(loadId && operatingCompanyId),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["dispatch-completion-prompts", loadId, operatingCompanyId] });

  // A simple in-flight flag keeps the buttons from double-firing; the mutation itself is a plain
  // fire-and-invalidate (no optimistic state worth modeling for a low-frequency click-confirm).
  const [submitting, setSubmitting] = useState(false);

  async function postLumper(body: { receipts_sent?: boolean; invoice_customer?: boolean }) {
    setSubmitting(true);
    try {
      await apiRequest(
        `/api/v1/dispatch/loads/${encodeURIComponent(loadId)}/completion-prompts/lumper?operating_company_id=${encodeURIComponent(
          operatingCompanyId
        )}`,
        { method: "POST", body }
      );
      invalidate();
    } finally {
      setSubmitting(false);
    }
  }

  async function postLatePenalty(penalty: boolean) {
    setSubmitting(true);
    try {
      await apiRequest(
        `/api/v1/dispatch/loads/${encodeURIComponent(
          loadId
        )}/completion-prompts/late-penalty?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
        { method: "POST", body: { penalty } }
      );
      invalidate();
    } finally {
      setSubmitting(false);
    }
  }

  if (promptsQuery.isLoading || promptsQuery.isError || !promptsQuery.data) return null;
  const prompts = promptsQuery.data;

  const showLumperBlock = prompts.is_reefer;
  const showLateBlock = prompts.late_stops.length > 0;
  if (!showLumperBlock && !showLateBlock) return null;

  return (
    <div
      className="rounded border border-slate-200 bg-slate-100 p-3 text-xs"
      data-testid="load-completion-prompts-card"
    >
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-700">Dispatch confirmations</div>

      {showLumperBlock ? (
        <div className="mb-2 border-b border-slate-200 pb-2 last:mb-0 last:border-0 last:pb-0" data-testid="load-completion-lumper-block">
          <div className="mb-1 text-xs font-semibold text-slate-700">Reefer load — lumper</div>
          {prompts.has_lumper ? (
            <div className="text-slate-600">
              Lumper on file
              {prompts.lumper_paid_by ? ` — paid by ${LUMPER_PAID_BY_LABEL[prompts.lumper_paid_by] ?? prompts.lumper_paid_by}` : ""}.
            </div>
          ) : (
            <div className="text-slate-500">No lumper recorded on this load's stops.</div>
          )}
          <ConfirmButtons
            label="Lumper receipts sent?"
            value={prompts.lumper_receipts_sent}
            onChoose={(v) => void postLumper({ receipts_sent: v })}
            disabled={submitting}
          />
          {prompts.lumper_paid_by && prompts.lumper_paid_by !== "carrier" ? (
            <ConfirmButtons
              label="Invoice the customer for this lumper too?"
              value={prompts.invoice_customer_for_lumper}
              onChoose={(v) => void postLumper({ invoice_customer: v })}
              disabled={submitting}
            />
          ) : null}
        </div>
      ) : null}

      {showLateBlock ? (
        <div data-testid="load-completion-late-penalty-block">
          <div className="mb-1 text-xs font-semibold text-slate-700">
            Driver was late — {prompts.late_stops.map((s) => `stop #${s.sequence} (${s.minutes_late}m late)`).join(", ")}
          </div>
          <ConfirmButtons
            label="Apply a late penalty?"
            value={prompts.late_penalty_decided}
            onChoose={(v) => void postLatePenalty(v)}
            disabled={submitting}
          />
        </div>
      ) : null}
    </div>
  );
}
