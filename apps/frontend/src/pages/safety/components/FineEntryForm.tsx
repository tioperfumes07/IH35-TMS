import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createInternalFine, createSafetyFine } from "../../../api/safety";
import { Button } from "../../../components/Button";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { useAutoDeductionPolicyMutations } from "../../../hooks/useAutoDeductionPolicies";

export type FineEntryKind = "dot" | "internal";

export type FineDeductionSchedule =
  | { mode: "one" }
  | { mode: "split"; installments: number };

export type FineEntryFormValues = {
  driverId: string;
  amountCents: number;
  description: string;
  schedule: FineDeductionSchedule;
  memo?: string;
};

type Props = {
  operatingCompanyId: string;
  kind: FineEntryKind;
  onSuccess?: (result: { fineId: string; policyId?: string }) => void;
  onCancel?: () => void;
};

function maxPerSettlementCents(amountCents: number, schedule: FineDeductionSchedule) {
  if (schedule.mode === "one") return amountCents;
  const n = Math.max(1, Math.min(52, Math.round(schedule.installments)));
  return Math.ceil(amountCents / n);
}

/** Creates a driver_finance.auto_deduction_policies row (deduction_type='fine') after a fine is logged. */
export function useFineDeductionPolicyCreator(operatingCompanyId: string) {
  const { createMutation } = useAutoDeductionPolicyMutations(operatingCompanyId);

  return {
    createPolicyForFine: async (input: {
      driverId: string;
      amountCents: number;
      fineId: string;
      schedule: FineDeductionSchedule;
      memo?: string;
    }) => {
      if (input.amountCents <= 0 || !input.driverId) return null;
      const result = await createMutation.mutateAsync({
        driver_id: input.driverId,
        deduction_type: "fine",
        total_owed_cents: input.amountCents,
        max_per_settlement_cents: maxPerSettlementCents(input.amountCents, input.schedule),
        memo: input.memo,
        source_ref: input.fineId,
      });
      return result.policy;
    },
    isCreating: createMutation.isPending,
  };
}

export function FineEntryForm({ operatingCompanyId, kind, onSuccess, onCancel }: Props) {
  const { createPolicyForFine } = useFineDeductionPolicyCreator(operatingCompanyId);

  const [driverId, setDriverId] = useState("");
  const [reasonUuid, setReasonUuid] = useState("");
  const [issuedByAuthority, setIssuedByAuthority] = useState("DOT");
  const [jurisdiction, setJurisdiction] = useState("");
  const [violationDescription, setViolationDescription] = useState("");
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().slice(0, 10));
  const [amountUsd, setAmountUsd] = useState("");
  const [notes, setNotes] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"one" | "split">("one");
  const [installments, setInstallments] = useState("3");
  const [error, setError] = useState<string | null>(null);

  const schedule: FineDeductionSchedule =
    scheduleMode === "one" ? { mode: "one" } : { mode: "split", installments: Math.max(2, Number(installments) || 2) };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const amountCents = Math.round(Number(amountUsd || 0) * 100);
      if (amountCents <= 0) throw new Error("Amount must be greater than zero.");
      if (!driverId.trim()) throw new Error("Driver is required.");

      let fineId: string;
      if (kind === "internal") {
        if (!reasonUuid.trim()) throw new Error("Reason is required for internal fines.");
        const created = await createInternalFine(operatingCompanyId, {
          driver_uuid: driverId.trim(),
          reason_uuid: reasonUuid.trim(),
          amount: amountCents / 100,
          imposed_date: issuedDate,
          status: "approved",
          notes: notes || undefined,
        });
        fineId = String((created as { id?: string }).id ?? (created as { fine?: { id?: string } }).fine?.id ?? "");
        if (!fineId) throw new Error("Fine created but no id returned.");
      } else {
        const created = await createSafetyFine(operatingCompanyId, {
          subject_type: "driver",
          subject_driver_id: driverId.trim(),
          issued_by_authority: issuedByAuthority,
          jurisdiction: jurisdiction || null,
          violation_description: violationDescription,
          issued_date: issuedDate,
          amount_cents: amountCents,
          notes: notes || null,
        });
        fineId = String((created as { id?: string }).id ?? (created as { fine?: { id?: string } }).fine?.id ?? "");
        if (!fineId) throw new Error("Fine created but no id returned.");
      }

      const memo =
        kind === "internal"
          ? `Internal fine${notes ? `: ${notes}` : ""}`
          : `DOT fine: ${violationDescription}${notes ? ` — ${notes}` : ""}`;

      const policy = await createPolicyForFine({
        driverId: driverId.trim(),
        amountCents,
        fineId,
        schedule,
        memo,
      });

      return { fineId, policyId: policy?.id };
    },
    onSuccess: (result) => {
      setError(null);
      onSuccess?.(result);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to save fine.");
    },
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        submitMutation.mutate();
      }}
    >
      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1 md:col-span-2">
          <label className="text-xs font-semibold text-gray-600">Driver ID</label>
          <input
            value={driverId}
            onChange={(event) => setDriverId(event.target.value)}
            className="rounded border border-gray-300 h-9 px-2 text-[13px]"
            placeholder="UUID"
            required
          />
        </div>

        {kind === "internal" ? (
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="text-xs font-semibold text-gray-600">Reason UUID</label>
            <input
              value={reasonUuid}
              onChange={(event) => setReasonUuid(event.target.value)}
              className="rounded border border-gray-300 h-9 px-2 text-[13px]"
              placeholder="Internal fine reason"
              required
            />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Issued by authority</label>
              <input
                value={issuedByAuthority}
                onChange={(event) => setIssuedByAuthority(event.target.value)}
                className="rounded border border-gray-300 h-9 px-2 text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Jurisdiction</label>
              <input
                value={jurisdiction}
                onChange={(event) => setJurisdiction(event.target.value)}
                className="rounded border border-gray-300 h-9 px-2 text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-xs font-semibold text-gray-600">Violation description</label>
              <input
                value={violationDescription}
                onChange={(event) => setViolationDescription(event.target.value)}
                className="rounded border border-gray-300 h-9 px-2 text-[13px]"
                required
              />
            </div>
          </>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">{kind === "internal" ? "Imposed date" : "Issued date"}</label>
          <input
            type="date"
            value={issuedDate}
            onChange={(event) => setIssuedDate(event.target.value)}
            className="rounded border border-gray-300 h-9 px-2 text-[13px]"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Amount USD</label>
          {/* M-1: dollars-mode QBO money entry; bridged so Math.round(*100) seam is byte-for-byte. */}
          <MoneyInput
            valueDollars={amountUsd ? Number(amountUsd) : null}
            onChangeDollars={(d) => setAmountUsd(d == null ? "" : String(d))}
            ariaLabel="Amount USD"
          />
        </div>
        <div className="flex flex-col gap-1 md:col-span-2">
          <label className="text-xs font-semibold text-gray-600">Notes</label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-[13px]"
            rows={2}
          />
        </div>
      </div>

      <fieldset className="rounded border border-amber-200 bg-amber-50 p-3">
        <legend className="px-1 text-xs font-semibold uppercase text-amber-900">Settlement deduction schedule</legend>
        <p className="mb-2 text-xs text-amber-800">
          Creates an auto-deduction policy (type fine). Net-floor cap may roll unpaid portions to the next settlement.
        </p>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="scheduleMode"
              checked={scheduleMode === "one"}
              onChange={() => setScheduleMode("one")}
            />
            One payment (full amount next settlement)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="scheduleMode"
              checked={scheduleMode === "split"}
              onChange={() => setScheduleMode("split")}
            />
            Split across
            <input
              type="number"
              min={2}
              max={52}
              className="w-16 rounded border border-gray-300 px-1 py-0.5 text-sm"
              value={installments}
              disabled={scheduleMode !== "split"}
              onChange={(event) => setInstallments(event.target.value)}
            />
            settlements
          </label>
        </div>
        {amountUsd && Number(amountUsd) > 0 ? (
          <p className="mt-2 text-xs text-amber-900">
            Max per settlement: $
            {(maxPerSettlementCents(Math.round(Number(amountUsd) * 100), schedule) / 100).toFixed(2)}
          </p>
        ) : null}
      </fieldset>

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={submitMutation.isPending}>
          Save fine &amp; create deduction policy
        </Button>
      </div>
    </form>
  );
}
