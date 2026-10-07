/**
 * ROUND 288.3 item 3 / CC-3 request — ADD PAYMENT: one detention / layover / bonus / stop-pay / other line on the
 * driver's OPEN settlement. Before, the driver page's "Add payment" could only open the Settlement Creator. Routed
 * through the settlement pay-line engine (POST /settlements/:id/pay-lines — never a direct insert): the line is stamped
 * to the driver's settlement, the load whose dates cover the pay date (owner rule) and the driver-pay GL account, and
 * the settlement header re-totals. Save and close, per the design law.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { MoneyInput } from "../forms/MoneyInput";
import { DatePicker } from "../forms/DatePicker";
import { useToast } from "../Toast";
import { companyToday } from "../../lib/businessDate";
import { addSettlementPayLine, listSettlements, type SettlementPayLineKind } from "../../api/driverFinance";

const KINDS: Array<{ value: SettlementPayLineKind; label: string }> = [
  { value: "detention", label: "Detention" },
  { value: "layover", label: "Layover" },
  { value: "bonus", label: "Bonus" },
  { value: "stop_pay", label: "Stop pay" },
  { value: "other", label: "Other pay" },
];
const OPEN = new Set(["open", "draft", "pending"]);
const fieldClass = "h-8 w-full rounded-sm border border-gray-300 px-2 text-xs";

export function AddPayLineModal(props: { open: boolean; onClose: () => void; operatingCompanyId: string; driverId: string; driverName?: string }) {
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [settlementId, setSettlementId] = useState("");
  const [kind, setKind] = useState<SettlementPayLineKind>("detention");
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [date, setDate] = useState(companyToday());
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const settlementsQuery = useQuery({
    queryKey: ["driver-finance", "settlements", props.operatingCompanyId, "open-for-driver", props.driverId],
    queryFn: () => listSettlements(props.operatingCompanyId),
    enabled: props.open && Boolean(props.operatingCompanyId),
  });
  const openSettlements = useMemo(
    () => (settlementsQuery.data?.settlements ?? []).filter((s) => s.driver_id === props.driverId && OPEN.has(String(s.status))),
    [settlementsQuery.data, props.driverId]
  );
  const chosen = settlementId || openSettlements[0]?.id || "";

  const save = useMutation({
    mutationFn: () =>
      addSettlementPayLine(chosen, {
        operating_company_id: props.operatingCompanyId,
        kind,
        amount_cents: amountCents ?? 0,
        transaction_date: date,
        description: description.trim() || null,
      }),
    onSuccess: (r) => {
      pushToast(`Added to settlement — load ${r.load_number}`, "success");
      void qc.invalidateQueries({ queryKey: ["driver-finance"] });
      void qc.invalidateQueries({ queryKey: ["driver-overview"] });
      props.onClose();
    },
    onError: (e) => setError(String((e as Error)?.message ?? "Could not add the pay line")),
  });

  const canSave = Boolean(chosen) && (amountCents ?? 0) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && !save.isPending;

  return (
    <Modal open={props.open} onClose={props.onClose} title={`Add payment${props.driverName ? ` — ${props.driverName}` : ""}`} variant="drawer" isDirty={(amountCents ?? 0) > 0} confirmDiscardOnClose>
      <div className="space-y-3 text-xs" data-testid="add-pay-line-modal">
        {settlementsQuery.isLoading ? <div className="text-gray-500">Loading settlements…</div> : null}
        {!settlementsQuery.isLoading && openSettlements.length === 0 ? (
          <div className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1 text-[#1F2A44]" data-testid="add-pay-line-no-open-settlement">
            This driver has no open settlement. Pay lines go on an open settlement — run a settlement first.
          </div>
        ) : null}
        {openSettlements.length > 0 ? (
          <label className="block">
            <span className="mb-1 block font-semibold text-gray-700">Settlement</span>
            <select className={fieldClass} value={chosen} onChange={(e) => setSettlementId(e.target.value)} aria-label="Settlement">
              {openSettlements.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_id ?? "Open settlement"} · {s.period_start} – {s.period_end}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block">
          <span className="mb-1 block font-semibold text-gray-700">Pay type</span>
          <select className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value as SettlementPayLineKind)} aria-label="Pay type">
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-semibold text-gray-700">Amount</span>
          <MoneyInput className={fieldClass} valueCents={amountCents} onChangeCents={(c) => setAmountCents(c)} ariaLabel="Pay amount" />
        </label>
        <label className="block">
          <span className="mb-1 block font-semibold text-gray-700">Date (decides the load)</span>
          <DatePicker value={date} onChange={setDate} aria-label="Pay date" />
        </label>
        <label className="block">
          <span className="mb-1 block font-semibold text-gray-700">Description</span>
          <input className={fieldClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" aria-label="Description" />
        </label>
        {error ? <div className="text-red-700" role="alert">{error}</div> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={props.onClose}>Cancel</Button>
          <Button type="button" variant="primary" disabled={!canSave} onClick={() => save.mutate()} data-testid="add-pay-line-save">Save and close</Button>
        </div>
      </div>
    </Modal>
  );
}
