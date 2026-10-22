/**
 * LEAD 443.243 — Fuel Assignment popup (QBO-style dimmed modal).
 * Opens when resolveFillTruckAndLoad is not 100% certain. Shows evidence + proposed answer.
 * Buttons: confirm proposed · pick another truck + load · keep on card truck (reason required).
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  answerFuelAssignmentQuestion,
  type FuelAssignmentQuestion,
  type FuelCandidateTruck,
} from "../../../api/fuelAssignmentQuestions";
import { Modal } from "../../../components/Modal";
import { EntityPicker } from "../../../components/EntityPicker";
import { EntityLink } from "../../../components/shared/EntityLink";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  question: FuelAssignmentQuestion | null;
  onClose: () => void;
  onAnswered: () => void;
};

function money(cents: string | null): string {
  if (cents == null || cents === "") return "—";
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
}

function CandidateRow({
  c,
  selected,
  onSelect,
}: {
  c: FuelCandidateTruck;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <tr
      data-testid={`fuel-assignment-candidate-${c.unit_id}`}
      className={selected ? "bg-[#EEF2F6]" : undefined}
      onClick={onSelect}
      style={{ cursor: "pointer" }}
    >
      <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs">
        <input type="radio" checked={selected} onChange={onSelect} aria-label={`Truck ${c.unit_number}`} />
      </td>
      <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs font-semibold text-[#1F2A44]">
        <EntityLink kind="unit" id={c.unit_id} label={c.unit_number} />
      </td>
      <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs whitespace-nowrap">
        {c.distance_mi != null ? `${c.distance_mi} mi` : "—"}
      </td>
      <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs whitespace-nowrap">
        {c.minutes_off != null ? `${c.minutes_off} min` : "—"}
      </td>
      <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs">{c.samsara_driver ?? "—"}</td>
      <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs whitespace-nowrap">
        {c.odometer != null ? `${c.odometer} mi` : "—"}
      </td>
      <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs font-semibold">
        {c.load.load_id ? (
          <EntityLink kind="load" id={c.load.load_id} label={c.load.load_number ?? "—"} />
        ) : (
          (c.load.load_number ?? "—")
        )}
      </td>
      <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs">{c.load.settlement_ref ?? "—"}</td>
      <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs">{c.load.route ?? "—"}</td>
    </tr>
  );
}

export function FuelAssignmentPopup({ open, operatingCompanyId, question, onClose, onAnswered }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"confirm" | "pick" | "keep">("confirm");
  const [pickUnitId, setPickUnitId] = useState<string>("");
  const [pickLoadId, setPickLoadId] = useState<string>("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open || !question) return;
    setMode("confirm");
    setPickUnitId(question.proposed_unit_id ?? question.card_unit_id ?? "");
    setPickLoadId(question.proposed_load_id ?? "");
    setReason("");
  }, [open, question?.id]);

  const candidates = useMemo(() => {
    const list = question?.evidence?.candidates ?? [];
    return Array.isArray(list) ? list : [];
  }, [question]);

  const answerMut = useMutation({
    mutationFn: async () => {
      if (!question) throw new Error("No question");
      if (mode === "confirm") {
        return answerFuelAssignmentQuestion(operatingCompanyId, question.id, {
          kind: "confirm_proposed",
        });
      }
      if (mode === "keep") {
        return answerFuelAssignmentQuestion(operatingCompanyId, question.id, {
          kind: "keep_card_truck",
          load_id: pickLoadId || question.proposed_load_id,
          reason,
        });
      }
      return answerFuelAssignmentQuestion(operatingCompanyId, question.id, {
        kind: "pick_other",
        unit_id: pickUnitId,
        load_id: pickLoadId,
        reason,
      });
    },
    onSuccess: () => {
      pushToast("Fuel assignment saved", "success");
      void queryClient.invalidateQueries({ queryKey: ["fuel", "assignment-questions"] });
      onAnswered();
      onClose();
    },
    onError: (err) => {
      pushToast(userFacingApiError(err, "Could not save fuel assignment"), "error");
    },
  });

  if (!question) return null;

  const th =
    "border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1.5 text-center text-section-header font-bold uppercase text-[#4B5563]";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Fuel assignment"
      wide
      modalKind="fuel-assignment-question"
      sizePreset="lg"
    >
      <div className="space-y-3 text-xs text-[#0F1219]" data-testid="fuel-assignment-popup">
        <p className="text-[#6B7280]">
          Not 100% certain which truck and load this fill belongs to. Review the evidence, then confirm
          the proposed answer, pick another truck and load, or keep it on the card truck (reason
          required).
        </p>

        <div
          className="grid gap-2 rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] p-3 md:grid-cols-3"
          data-testid="fuel-assignment-fill-summary"
        >
          <div>
            <div className="text-section-header font-bold uppercase text-[#4B5563]">Fill (Central)</div>
            <div className="mt-0.5 font-semibold">{question.fill_moment_ct ?? "—"}</div>
          </div>
          <div>
            <div className="text-section-header font-bold uppercase text-[#4B5563]">Station</div>
            <div className="mt-0.5 font-semibold">{question.station?.trim() || "—"}</div>
          </div>
          <div>
            <div className="text-section-header font-bold uppercase text-[#4B5563]">Gallons / Amount</div>
            <div className="mt-0.5 font-semibold">
              {question.gallons ?? "—"} gal · {money(question.amount_cents)}
            </div>
          </div>
          <div>
            <div className="text-section-header font-bold uppercase text-[#4B5563]">Card truck</div>
            <div className="mt-0.5 font-semibold">{question.card_unit_number ?? "—"}</div>
          </div>
          <div>
            <div className="text-section-header font-bold uppercase text-[#4B5563]">Card driver</div>
            <div className="mt-0.5 font-semibold">{question.card_driver_name ?? "—"}</div>
          </div>
          <div>
            <div className="text-section-header font-bold uppercase text-[#4B5563]">Resolution</div>
            <div className="mt-0.5 font-semibold">
              {question.evidence?.truck_resolution ?? "—"} / {question.evidence?.load_resolution ?? "—"}
            </div>
          </div>
        </div>

        <div
          className="rounded-sm border border-[#E5E7EB] bg-white p-3"
          data-testid="fuel-assignment-proposed"
          style={{ borderLeft: "3px solid #16A34A" }}
        >
          <div className="text-section-header font-bold uppercase text-[#4B5563]">Proposed answer</div>
          <div className="mt-1 text-xs font-semibold">
            Truck {question.proposed_unit_number ?? "—"} · Load {question.proposed_load_number ?? "—"}
            {question.proposed_settlement_ref ? ` · Settlement ${question.proposed_settlement_ref}` : ""}
          </div>
          <p className="mt-1 text-[#4B5563]">{question.proposed_why ?? "—"}</p>
        </div>

        <div className="overflow-x-auto" data-testid="fuel-assignment-candidates-table">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Pick</th>
                <th className={th}>Truck</th>
                <th className={th}>GPS mi</th>
                <th className={th}>Minutes</th>
                <th className={th}>Samsara driver</th>
                <th className={th}>Odometer</th>
                <th className={th}>Load</th>
                <th className={th}>Settlement</th>
                <th className={th}>Route</th>
              </tr>
            </thead>
            <tbody>
              {candidates.length === 0 ? (
                <tr>
                  <td colSpan={9} className="border border-[#E5E7EB] px-2 py-3 text-center text-[#6B7280]">
                    No GPS candidates at the pump — card truck still keeps the fill until confirmed.
                  </td>
                </tr>
              ) : (
                candidates.map((c) => (
                  <CandidateRow
                    key={c.unit_id}
                    c={c}
                    selected={pickUnitId === c.unit_id}
                    onSelect={() => {
                      setPickUnitId(c.unit_id);
                      if (c.load.load_id) setPickLoadId(c.load.load_id);
                      setMode("pick");
                    }}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-2" data-testid="fuel-assignment-mode-buttons">
          <button
            type="button"
            className={`rounded-sm border px-3 text-xs font-semibold ${mode === "confirm" ? "border-[#14314F] bg-[#14314F] text-white" : "border-[#E5E7EB] bg-[var(--surface-unselected)] text-[#1F2A44] hover:bg-[var(--surface-hover)]"}`}
            style={{ height: 28 }}
            data-testid="fuel-assignment-mode-confirm"
            onClick={() => setMode("confirm")}
          >
            Confirm proposed
          </button>
          <button
            type="button"
            className={`rounded-sm border px-3 text-xs font-semibold ${mode === "pick" ? "border-[#14314F] bg-[#14314F] text-white" : "border-[#E5E7EB] bg-[var(--surface-unselected)] text-[#1F2A44] hover:bg-[var(--surface-hover)]"}`}
            style={{ height: 28 }}
            data-testid="fuel-assignment-mode-pick"
            onClick={() => setMode("pick")}
          >
            Pick another truck + load
          </button>
          <button
            type="button"
            className={`rounded-sm border px-3 text-xs font-semibold ${mode === "keep" ? "border-[#14314F] bg-[#14314F] text-white" : "border-[#E5E7EB] bg-[var(--surface-unselected)] text-[#1F2A44] hover:bg-[var(--surface-hover)]"}`}
            style={{ height: 28 }}
            data-testid="fuel-assignment-mode-keep"
            onClick={() => setMode("keep")}
          >
            Keep on card truck
          </button>
        </div>

        {(mode === "pick" || mode === "keep") && (
          <div className="grid gap-3 rounded-sm border border-[#E5E7EB] p-3 md:grid-cols-2" data-testid="fuel-assignment-pick-fields">
            {mode === "pick" ? (
              <label className="block font-semibold text-[#4B5563]">
                Truck
                <div className="mt-1">
                  <EntityPicker
                    kind="unit"
                    operatingCompanyId={operatingCompanyId}
                    value={pickUnitId || null}
                    onChange={(id) => setPickUnitId(id ?? "")}
                    placeholder="Search unit…"
                    dataTestId="fuel-assignment-pick-unit"
                    allowClear
                  />
                </div>
              </label>
            ) : (
              <div>
                <div className="font-semibold text-[#4B5563]">Card truck</div>
                <div className="mt-1 font-semibold text-[#1F2A44]">{question.card_unit_number ?? "—"}</div>
              </div>
            )}
            <label className="block font-semibold text-[#4B5563]">
              Load
              <div className="mt-1">
                <EntityPicker
                  kind="load"
                  operatingCompanyId={operatingCompanyId}
                  value={pickLoadId || null}
                  onChange={(id) => setPickLoadId(id ?? "")}
                  placeholder="Search trip / load…"
                  dataTestId="fuel-assignment-pick-load"
                  allowClear
                />
              </div>
            </label>
            <label className="block font-semibold text-[#4B5563] md:col-span-2">
              Reason {mode === "keep" || mode === "pick" ? "*" : ""}
              <textarea
                className="mt-1 w-full rounded-sm border border-[#E5E7EB] px-2 py-1.5 text-xs"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                data-testid="fuel-assignment-reason"
                placeholder={
                  mode === "keep"
                    ? "Why keep this fill on the card truck?"
                    : "Why this truck and load?"
                }
              />
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-[#E5E7EB] pt-3">
          <button
            type="button"
            className="rounded-sm border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-[#1F2A44]"
            style={{ height: 28 }}
            onClick={onClose}
            data-testid="fuel-assignment-cancel"
            disabled={answerMut.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-sm border border-[#14314F] bg-[#14314F] px-3 text-xs font-semibold text-white disabled:opacity-50"
            style={{ height: 28 }}
            data-testid="fuel-assignment-submit"
            disabled={answerMut.isPending}
            onClick={() => answerMut.mutate()}
          >
            {answerMut.isPending
              ? "Saving…"
              : mode === "confirm"
                ? "Confirm proposed"
                : mode === "keep"
                  ? "Keep on card truck"
                  : "Assign truck + load"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
