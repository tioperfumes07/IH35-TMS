/**
 * LEAD 443.295 — Fuel assignment popup. Medium (720). Sections match
 * docs/design/v3/V3-Modal-FuelAssignment.dc.html. No free-text reason.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  answerFuelAssignmentQuestion,
  type FuelAssignmentQuestion,
  type FuelCandidateTruck,
} from "../../../api/fuelAssignmentQuestions";
import { listOverrideReasons } from "../../../api/catalogs";
import { useAuth } from "../../../auth/useAuth";
import { Modal, ModalSection } from "../../../components/Modal";
import { EntityPicker } from "../../../components/EntityPicker";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";
import { useTranslation } from "../../../hooks/useTranslation";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  question: FuelAssignmentQuestion | null;
  onClose: () => void;
  onAnswered: () => void;
};

const PRIVILEGED = new Set(["Owner", "Accountant"]);

function money(cents: string | null): string {
  if (cents == null || cents === "") return "—";
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
}

function fromStation(c: FuelCandidateTruck): string {
  return c.distance_mi != null ? `${c.distance_mi} mi` : "—";
}

function atStation(c: FuelCandidateTruck): string {
  if (c.at_station) return c.at_station;
  if (c.minutes_off === 0) return "At pump";
  if (c.minutes_off != null) return `${c.minutes_off} min`;
  return "—";
}

function odometerAtFill(c: FuelCandidateTruck): string {
  const odo = c.odometer_at_fill ?? c.odometer;
  return odo != null ? `${odo} mi` : "—";
}

function statusPill(c: FuelCandidateTruck): { text: string; className: string } | null {
  if (c.minutes_off === 0) return { text: "At pump", className: "bg-[#ECFDF3] text-[#166534]" };
  if (c.distance_mi == null && c.odometer == null && c.odometer_at_fill == null) {
    return { text: "No GPS", className: "bg-[#FFFBEB] text-[#92400E]" };
  }
  return null;
}

const labelStyle = { fontSize: 11, color: "#6B7280" } as const;
const valueStyle = { fontSize: 13, fontWeight: 600 } as const;

function CandidateRow({
  c,
  onSelect,
}: {
  c: FuelCandidateTruck;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const pill = statusPill(c);
  return (
    <tr
      data-testid={`fuel-assignment-candidate-${c.unit_id}`}
      onClick={onSelect}
      className="cursor-pointer"
    >
      <td className="border-b border-[#E5E7EB] px-2.5 py-1.5 text-xs font-semibold text-[#1F2A44]">
        {c.unit_id ? (
          <EntityLink kind="unit" id={c.unit_id} label={entityLabel(c.unit_number, c.unit_id, "Unit")} onClick={(e) => e.stopPropagation()} />
        ) : (c.unit_number ?? "—")}
      </td>
      <td className="border-b border-[#E5E7EB] px-2.5 py-1.5 text-xs">{c.samsara_driver ?? "—"}</td>
      <td className="border-b border-[#E5E7EB] px-2.5 py-1.5 text-right text-xs tabular-nums">{fromStation(c)}</td>
      <td className="border-b border-[#E5E7EB] px-2.5 py-1.5 text-xs whitespace-nowrap">{atStation(c)}</td>
      <td className="border-b border-[#E5E7EB] px-2.5 py-1.5 text-right text-xs tabular-nums whitespace-nowrap">{odometerAtFill(c)}</td>
      <td className="border-b border-[#E5E7EB] px-2.5 py-1.5 text-xs">
        {c.load ? (
          c.load.load_id ? (
            <EntityLink kind="load" id={c.load.load_id} label={entityLabel(c.load.load_number, c.load.load_id, "Load")} onClick={(e) => e.stopPropagation()} />
          ) : (
            c.load.load_number ?? "—"
          )
        ) : (
          <span data-testid={`fuel-assignment-candidate-no-load-${c.unit_id}`} className="text-[#6B7280]">
            {t("fuel.no_load_at_pump", "No load at pump time")}
          </span>
        )}
      </td>
      <td className="border-b border-[#E5E7EB] px-2.5 py-1.5 text-xs">
        {pill ? (
          <span className={`inline-block rounded-sm px-1.5 font-semibold ${pill.className}`} style={{ fontSize: 11 }}>
            {pill.text}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

export function FuelAssignmentPopup({ open, operatingCompanyId, question, onClose, onAnswered }: Props) {
  const { pushToast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const privileged = PRIVILEGED.has(user?.role ?? "");
  const [mode, setMode] = useState<"confirm" | "pick" | "keep">("confirm");
  const [pickUnitId, setPickUnitId] = useState<string>("");
  const [pickLoadId, setPickLoadId] = useState<string>("");
  const [reasonCode, setReasonCode] = useState("");

  useEffect(() => {
    if (!open || !question) return;
    setMode("confirm");
    setPickUnitId(question.proposed_unit_id ?? question.card_unit_id ?? "");
    setPickLoadId(question.proposed_load_id ?? "");
    setReasonCode("");
  }, [open, question?.id]);

  const reasonsQuery = useQuery({
    queryKey: ["override-reasons", operatingCompanyId, "fuel-assignment"],
    queryFn: () => listOverrideReasons(operatingCompanyId),
    enabled: open && !privileged && mode !== "confirm" && Boolean(operatingCompanyId),
  });
  const reasons = useMemo(
    () => (reasonsQuery.data?.reasons ?? []).filter((row) => row.is_active && !row.role_only),
    [reasonsQuery.data?.reasons],
  );

  const candidates = useMemo(() => {
    const list = question?.evidence?.candidates ?? [];
    return Array.isArray(list) ? list : [];
  }, [question]);

  const answerMut = useMutation({
    mutationFn: async () => {
      if (!question) throw new Error("No question");
      const reason = privileged ? null : (reasons.find((row) => row.reason_code === reasonCode)?.label_en ?? null);
      if (mode === "confirm") {
        return answerFuelAssignmentQuestion(operatingCompanyId, question.id, { kind: "confirm_proposed" });
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

  const needsReason = !privileged && mode !== "confirm";
  const canSubmit =
    !answerMut.isPending &&
    (mode === "confirm" || (mode === "keep" && (!needsReason || Boolean(reasonCode))) || (mode === "pick" && Boolean(pickUnitId) && (!needsReason || Boolean(reasonCode))));

  const th = "border-b border-[#E5E7EB] px-2.5 py-1.5 text-left text-section-header font-bold uppercase text-[#4B5563]";
  const modeBtn = (active: boolean) =>
    `h-8 rounded-sm border px-3 text-xs font-semibold ${active ? "border-[#1F2A44] bg-white shadow-[inset_0_0_0_1px_#1F2A44]" : "border-[#E5E7EB] bg-white text-[#0F1219]"}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Fuel assignment"
      modalKind="fuel-assignment-question"
      sizePreset="md"
      footerNote="Confirmed by you. The fill, its receipt, and its discount move together."
      footer={
        <>
          <button
            type="button"
            className="h-8 rounded-sm border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-[#0F1219]"
            onClick={onClose}
            data-testid="fuel-assignment-cancel"
            disabled={answerMut.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-8 rounded-sm border border-[#1F2A44] bg-[#1F2A44] px-3 text-xs font-semibold text-white disabled:opacity-50"
            data-testid="fuel-assignment-submit"
            disabled={!canSubmit}
            onClick={() => answerMut.mutate()}
          >
            {answerMut.isPending ? "Saving…" : "Confirm"}
          </button>
        </>
      }
    >
      <div className="space-y-3" data-testid="fuel-assignment-popup">
        <ModalSection title="Fill" source={question.station?.trim() || undefined}>
          <div className="grid grid-cols-2 md:grid-cols-4" data-testid="fuel-assignment-fill-summary">
            <div className="border-r border-[#E5E7EB] px-2.5 py-2">
              <div style={labelStyle}>Fill time (Central)</div>
              <div style={valueStyle}>{question.fill_moment_ct ?? "—"}</div>
            </div>
            <div className="border-r border-[#E5E7EB] px-2.5 py-2">
              <div style={labelStyle}>Station</div>
              <div style={valueStyle}>
                <EntityLink kind="fuel_transaction" id={question.fuel_transaction_id} label={question.station?.trim() || "Fuel fill"} />
              </div>
            </div>
            <div className="border-r border-[#E5E7EB] px-2.5 py-2">
              <div style={labelStyle}>Gallons · amount</div>
              <div style={valueStyle}>{question.gallons ?? "—"} gal</div>
              <div style={labelStyle}>{money(question.amount_cents)}</div>
            </div>
            <div className="px-2.5 py-2">
              <div style={labelStyle}>Card truck · driver</div>
              <div style={valueStyle}>
                {question.card_unit_id ? (
                  <EntityLink kind="unit" id={question.card_unit_id} label={entityLabel(question.card_unit_number, question.card_unit_id, "Unit")} />
                ) : (question.card_unit_number ?? "—")}
              </div>
              <div style={labelStyle}>
                {question.card_driver_id ? (
                  <EntityLink kind="driver" id={question.card_driver_id} label={entityLabel(question.card_driver_name, question.card_driver_id, "Driver")} />
                ) : (question.card_driver_name ?? "—")}
              </div>
            </div>
          </div>
        </ModalSection>

        <ModalSection title="Evidence" source="Samsara GPS · odometer">
          <div className="overflow-x-auto" data-testid="fuel-assignment-candidates-table">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Truck</th>
                  <th className={th}>Driver</th>
                  <th className={`${th} text-right`}>From station</th>
                  <th className={th}>At station</th>
                  <th className={`${th} text-right`}>Odometer at fill</th>
                  <th className={th}>Load at fill</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {candidates.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2.5 py-3 text-center text-xs text-[#6B7280]">
                      No GPS candidates at the pump. The card truck still keeps the fill until confirmed.
                    </td>
                  </tr>
                ) : (
                  candidates.map((c) => (
                    <CandidateRow
                      key={c.unit_id}
                      c={c}
                      onSelect={() => {
                        setPickUnitId(c.unit_id);
                        setPickLoadId(c.load?.load_id ?? "");
                        setMode("pick");
                      }}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ModalSection>

        <ModalSection title="Proposed" source="engine">
          <div className="flex flex-wrap gap-4 px-2.5 py-2" data-testid="fuel-assignment-proposed">
            <div>
              <div style={labelStyle}>Truck</div>
              <div style={valueStyle}>
                {question.proposed_unit_id ? (
                  <EntityLink kind="unit" id={question.proposed_unit_id} label={entityLabel(question.proposed_unit_number, question.proposed_unit_id, "Unit")} />
                ) : (question.proposed_unit_number ?? "—")}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Load</div>
              <div style={valueStyle}>
                {question.proposed_load_id ? (
                  <EntityLink kind="load" id={question.proposed_load_id} label={entityLabel(question.proposed_load_number, question.proposed_load_id, "Load")} />
                ) : (question.proposed_load_number ?? "—")}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div style={labelStyle}>Why</div>
              <div style={labelStyle}>{question.proposed_why ?? "—"}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 px-2.5 pb-2.5" data-testid="fuel-assignment-mode-buttons">
            <button type="button" className={modeBtn(mode === "confirm")} data-testid="fuel-assignment-mode-confirm" onClick={() => setMode("confirm")}>
              Confirm proposed
            </button>
            <button type="button" className={modeBtn(mode === "pick")} data-testid="fuel-assignment-mode-pick" onClick={() => setMode("pick")}>
              Choose another truck and load
            </button>
            <button type="button" className={modeBtn(mode === "keep")} data-testid="fuel-assignment-mode-keep" onClick={() => setMode("keep")}>
              Keep on card truck
            </button>
          </div>
        </ModalSection>

        {mode !== "confirm" ? (
          <ModalSection title="Change" source="only when not confirming">
            <div className="flex flex-wrap items-end gap-2.5 p-2.5" data-testid="fuel-assignment-pick-fields">
              {mode === "pick" ? (
                <label className="block">
                  <span style={labelStyle}>Truck</span>
                  <div className="mt-1 w-[160px]">
                    <EntityPicker
                      kind="unit"
                      operatingCompanyId={operatingCompanyId}
                      value={pickUnitId || null}
                      onChange={(id) => setPickUnitId(id ?? "")}
                      placeholder="Truck"
                      dataTestId="fuel-assignment-pick-unit"
                      allowClear
                    />
                  </div>
                </label>
              ) : (
                <div>
                  <div style={labelStyle}>Truck</div>
                  <div className="mt-1" style={valueStyle}>{question.card_unit_number ?? "—"}</div>
                </div>
              )}
              <label className="block">
                <span style={labelStyle}>Load</span>
                <div className="mt-1 w-[200px]">
                  <EntityPicker
                    kind="load"
                    operatingCompanyId={operatingCompanyId}
                    value={pickLoadId || null}
                    onChange={(id) => setPickLoadId(id ?? "")}
                    placeholder="Load"
                    dataTestId="fuel-assignment-pick-load"
                    allowClear
                  />
                </div>
              </label>
              {needsReason ? (
                <label className="block">
                  <span style={labelStyle}>Reason</span>
                  <select
                    className="mt-1 h-8 w-[260px] rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs"
                    value={reasonCode}
                    onChange={(e) => setReasonCode(e.target.value)}
                    data-testid="fuel-assignment-reason"
                  >
                    <option value="">Select a reason</option>
                    {reasons.map((row) => (
                      <option key={row.id} value={row.reason_code}>{row.label_en}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-xs text-[#6B7280]">Owner / accountant: no reason. Confirm only.</p>
              )}
            </div>
          </ModalSection>
        ) : null}

        <details className="rounded-sm border border-[#E5E7EB]" data-testid="fuel-assignment-engine-notes">
          <summary className="cursor-pointer bg-[#F7F8FA] px-2.5 py-1.5 text-section-header font-bold uppercase text-[#4B5563]">
            Engine notes
          </summary>
          <p className="px-2.5 py-2 text-xs text-[#4B5563]">
            {question.evidence?.truck_resolution ?? "—"} / {question.evidence?.load_resolution ?? "—"}
            {question.evidence?.moment_source ? ` · ${question.evidence.moment_source}` : ""}
          </p>
        </details>
      </div>
    </Modal>
  );
}
