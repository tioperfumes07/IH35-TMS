/**
 * ROUND 443.295 — Fuel Assignment popup = docs/design/v3/V3-Modal-FuelAssignment (md 720).
 * Engines unchanged: answerFuelAssignmentQuestion confirm_proposed / pick_other / keep_card_truck.
 * Reasons = catalog dropdown (VoidReasonModal), never a free-text box.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  answerFuelAssignmentQuestion,
  type FuelAssignmentQuestion,
  type FuelCandidateTruck,
} from "../../../api/fuelAssignmentQuestions";
import { Modal } from "../../../components/Modal";
import { EntityPicker } from "../../../components/EntityPicker";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";
import { useTranslation } from "../../../hooks/useTranslation";
import { VoidReasonModal } from "../../../components/accounting/VoidReasonModal";
import { V3 } from "../../../design/v3-tokens";

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

function ModalSection({
  title,
  source,
  children,
  testId,
}: {
  title: string;
  source?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section data-testid={testId} style={{ border: `1px solid ${V3.border}`, borderRadius: 2, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          background: "#F7F8FA",
          borderBottom: `1px solid ${V3.borderSoft}`,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: V3.muted }}>
          {title}
        </span>
        {source ? <span style={{ fontSize: 11, color: V3.muted }}>{source}</span> : null}
      </div>
      <div style={{ padding: 10 }}>{children}</div>
    </section>
  );
}

function Kv({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: V3.muted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: V3.ink }}>{children}</div>
    </div>
  );
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
  const { t } = useTranslation();
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
        {c.unit_id ? (
          <EntityLink kind="unit" id={c.unit_id} label={entityLabel(c.unit_number, c.unit_id, "Unit")} onClick={(e) => e.stopPropagation()} />
        ) : (
          c.unit_number ?? "—"
        )}
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
      {c.load ? (
        <>
          <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs font-semibold">
            {c.load.load_id ? (
              <EntityLink kind="load" id={c.load.load_id} label={entityLabel(c.load.load_number, c.load.load_id, "Load")} onClick={(e) => e.stopPropagation()} />
            ) : (
              c.load.load_number ?? "—"
            )}
          </td>
          <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs">{c.load.settlement_ref ?? "—"}</td>
          <td className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs">{c.load.route ?? "—"}</td>
        </>
      ) : (
        <td
          colSpan={3}
          className="border border-[#E5E7EB] px-2 py-1.5 text-center text-xs text-[#6B7280]"
          data-testid={`fuel-assignment-candidate-no-load-${c.unit_id}`}
        >
          {t("fuel.no_load_at_pump", "No load at pump time")}
        </td>
      )}
    </tr>
  );
}

export function FuelAssignmentPopup({ open, operatingCompanyId, question, onClose, onAnswered }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"confirm" | "pick" | "keep">("confirm");
  const [pickUnitId, setPickUnitId] = useState<string>("");
  const [pickLoadId, setPickLoadId] = useState<string>("");
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    if (!open || !question) return;
    setMode("confirm");
    setPickUnitId(question.proposed_unit_id ?? question.card_unit_id ?? "");
    setPickLoadId(question.proposed_load_id ?? "");
    setNotesOpen(false);
  }, [open, question?.id]);

  const candidates = useMemo(() => {
    const list = question?.evidence?.candidates ?? [];
    return Array.isArray(list) ? list : [];
  }, [question]);

  const answerMut = useMutation({
    mutationFn: async (reasonCode?: string) => {
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
          reason: reasonCode,
        });
      }
      return answerFuelAssignmentQuestion(operatingCompanyId, question.id, {
        kind: "pick_other",
        unit_id: pickUnitId,
        load_id: pickLoadId,
        reason: reasonCode,
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

  const modeBtn = (active: boolean): React.CSSProperties => ({
    height: 32,
    padding: "0 12px",
    borderRadius: 2,
    border: `1px solid ${active ? V3.ink : V3.border}`,
    background: active ? V3.ink : "#fff",
    color: active ? "#fff" : V3.ink,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: V3.font,
  });

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Fuel assignment · confirm truck & load"
        modalKind="fuel-assignment-question"
        sizePreset="md"
        size="md"
      >
        <div className="space-y-3 text-xs text-[#0F1219]" data-testid="fuel-assignment-popup">
          <ModalSection title="Fill" source={question.evidence?.moment_source ?? "Dreamline · Relay"} testId="fuel-assignment-fill-summary">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
              <Kv label="Fill time (Central)">{question.fill_moment_ct ?? "—"}</Kv>
              <Kv label="Station">
                <EntityLink kind="fuel_transaction" id={question.fuel_transaction_id} label={question.station?.trim() || "Fuel fill"} />
              </Kv>
              <Kv label="Gallons · amount">
                {question.gallons ?? "—"} gal · {money(question.amount_cents)}
              </Kv>
              <Kv label="Card truck · driver">
                {question.card_unit_id ? (
                  <EntityLink kind="unit" id={question.card_unit_id} label={entityLabel(question.card_unit_number, question.card_unit_id, "Unit")} />
                ) : (
                  question.card_unit_number ?? "—"
                )}
                {" · "}
                {question.card_driver_id ? (
                  <EntityLink kind="driver" id={question.card_driver_id} label={entityLabel(question.card_driver_name, question.card_driver_id, "Driver")} />
                ) : (
                  question.card_driver_name ?? "—"
                )}
              </Kv>
            </div>
          </ModalSection>

          <ModalSection title="Evidence — trucks at the station" testId="fuel-assignment-candidates-table">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={th}>Pick</th>
                    <th className={th}>Truck</th>
                    <th className={th}>From station</th>
                    <th className={th}>At station</th>
                    <th className={th}>Driver</th>
                    <th className={th}>Odometer at fill</th>
                    <th className={th}>Load at fill</th>
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

          <ModalSection title="Proposed" source="engine" testId="fuel-assignment-proposed">
            <div style={{ display: "grid", gap: 8 }}>
              <Kv label="Load">
                {question.proposed_load_id ? (
                  <EntityLink kind="load" id={question.proposed_load_id} label={entityLabel(question.proposed_load_number, question.proposed_load_id, "Load")} />
                ) : (
                  question.proposed_load_number ?? "—"
                )}
                {question.proposed_unit_id ? (
                  <>
                    {" · "}
                    <EntityLink kind="unit" id={question.proposed_unit_id} label={entityLabel(question.proposed_unit_number, question.proposed_unit_id, "Unit")} />
                  </>
                ) : null}
              </Kv>
              <Kv label="Why">{question.proposed_why ?? "—"}</Kv>
              <div className="flex flex-wrap gap-2" data-testid="fuel-assignment-mode-buttons">
                <button
                  type="button"
                  style={modeBtn(mode === "confirm")}
                  data-testid="fuel-assignment-mode-confirm"
                  onClick={() => setMode("confirm")}
                >
                  Confirm proposed
                </button>
                <button
                  type="button"
                  style={modeBtn(mode === "pick")}
                  data-testid="fuel-assignment-mode-pick"
                  onClick={() => setMode("pick")}
                >
                  Choose another truck & load
                </button>
                <button
                  type="button"
                  style={modeBtn(mode === "keep")}
                  data-testid="fuel-assignment-mode-keep"
                  onClick={() => setMode("keep")}
                >
                  Keep on card truck
                </button>
              </div>
            </div>
          </ModalSection>

          {mode === "pick" || mode === "keep" ? (
            <ModalSection title="Change" source="only when not confirming" testId="fuel-assignment-pick-fields">
              <div style={{ display: "grid", gridTemplateColumns: "160px 200px", gap: 12, alignItems: "end" }}>
                {mode === "pick" ? (
                  <label className="block" style={{ fontSize: 11, color: V3.muted }}>
                    Truck
                    <div className="mt-1" style={{ width: 160 }}>
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
                  <Kv label="Card truck">{question.card_unit_number ?? "—"}</Kv>
                )}
                <label className="block" style={{ fontSize: 11, color: V3.muted }}>
                  Load
                  <div className="mt-1" style={{ width: 200 }}>
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
              </div>
              <p style={{ marginTop: 8, fontSize: 11, color: V3.muted }}>
                Reason is chosen from the catalog on Confirm (dropdown — never a text box).
              </p>
            </ModalSection>
          ) : null}

          <details
            open={notesOpen}
            onToggle={(e) => setNotesOpen((e.target as HTMLDetailsElement).open)}
            data-testid="fuel-assignment-engine-notes"
            style={{ border: `1px solid ${V3.border}`, borderRadius: 2, padding: "6px 10px" }}
          >
            <summary style={{ fontSize: 11, fontWeight: 700, color: V3.muted, cursor: "pointer", textTransform: "uppercase" }}>
              Engine notes
            </summary>
            <p style={{ marginTop: 6, fontSize: 12, color: V3.ink }}>
              {question.evidence?.truck_resolution ?? "—"} / {question.evidence?.load_resolution ?? "—"}. Confirmed by you ·
              audit row written · the fill, its receipt and its discount move together.
            </p>
          </details>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              borderTop: `1px solid ${V3.borderSoft}`,
              paddingTop: 10,
              minHeight: 52,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              style={{ ...modeBtn(false), background: "#fff" }}
              onClick={onClose}
              data-testid="fuel-assignment-cancel"
              disabled={answerMut.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              style={{ ...modeBtn(true), opacity: answerMut.isPending ? 0.5 : 1 }}
              data-testid="fuel-assignment-submit"
              disabled={answerMut.isPending}
              onClick={() => {
                if (mode === "confirm") answerMut.mutate(undefined);
                else setVoidModalOpen(true);
              }}
            >
              {answerMut.isPending
                ? "Saving…"
                : mode === "confirm"
                  ? "Confirm"
                  : mode === "keep"
                    ? "Keep on card truck"
                    : "Confirm"}
            </button>
          </div>
        </div>
      </Modal>
      <VoidReasonModal
        title="Fuel assignment reason"
        open={voidModalOpen}
        onClose={() => setVoidModalOpen(false)}
        onSubmit={async (reasonCode) => {
          setVoidModalOpen(false);
          answerMut.mutate(reasonCode);
        }}
        submitLabel="Confirm"
      />
    </>
  );
}
