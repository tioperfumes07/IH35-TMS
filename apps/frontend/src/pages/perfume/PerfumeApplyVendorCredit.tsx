/**
 * TIO Perfumes · Payables · vendor credits — LEAD item 26 (owner 15:05 CT "fully wire … AP"). A vendor credit (goods returned after billing,
 * #29960) is applied to an open bill of the same vendor through the ONE vendor-credit apply engine (POST /api/v1/accounting/vendor-credits/
 * :id/apply — vendor identity check, row lock, over-apply refusal, idempotency). No new GL math: the bill's balance falls by the amount
 * applied, the credit's unapplied amount falls with it. Pop-up per owner 17:25 CT.
 */
import { useMemo, useState } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { applyVendorCredit } from "../../api/vendor-credits";
import type { ScentsxApCredit, ScentsxApOpenBill } from "../../api/scentsx";
import { tr } from "./perfumeI18n";
import { ctl, DASH, money, usDate } from "./perfumeDocParts";

export function PerfumeVendorCredits({ credits, openBills, companyId, onDone }: { credits: ScentsxApCredit[]; openBills: ScentsxApOpenBill[]; companyId: string; onDone: () => Promise<void> }) {
  const [applying, setApplying] = useState<ScentsxApCredit | null>(null);
  return (
    <>
      <ParityTable<ScentsxApCredit>
        cardTitle title={tr("perfume.ap.credits", "Vendor credits")} rows={credits} rowKey={(r) => `${r.id}-${r.unapplied_cents}`} storageKey="perfume-ap-credits-v1" exportFilename="TIO vendor credits" exportExcel
        emptyText="No vendor credits."
        columns={[
          { className: "text-left", key: "display_id", label: "Credit", render: (r) => r.display_id, exportValue: (r) => r.display_id },
          { key: "issue_date", label: "Date", cellClass: "text-right tabular-nums", render: (r) => usDate(r.issue_date), exportValue: (r) => r.issue_date },
          { className: "text-left", key: "notes", label: "Memo", render: (r) => r.notes ?? DASH, exportValue: (r) => r.notes ?? "" },
          { key: "amount_cents", label: "Amount", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.amount_cents), exportValue: (r) => r.amount_cents / 100 },
          { key: "applied_cents", label: "Applied", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.applied_cents), exportValue: (r) => r.applied_cents / 100 },
          { key: "unapplied_cents", label: "Left to apply", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (r) => money(r.unapplied_cents), exportValue: (r) => r.unapplied_cents / 100 },
          { key: "apply", label: "", render: (r) => (r.unapplied_cents > 0 && openBills.length ? (
            <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={() => setApplying(r)} data-testid={`perfume-ap-apply-credit-${r.id}`}>{tr("perfume.ap.apply_credit", "Apply to a bill")}</Button>) : DASH) },
        ]}
      />
      {applying ? <ApplyCredit credit={applying} openBills={openBills} companyId={companyId} onClose={() => setApplying(null)} onDone={async () => { setApplying(null); await onDone(); }} /> : null}
    </>
  );
}

function ApplyCredit({ credit, openBills, companyId, onClose, onDone }: { credit: ScentsxApCredit; openBills: ScentsxApOpenBill[]; companyId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [billId, setBillId] = useState(openBills[0]?.id ?? "");
  const bill = useMemo(() => openBills.find((b) => b.id === billId) ?? null, [openBills, billId]);
  const cap = bill ? Math.min(credit.unapplied_cents, bill.open_cents) : 0;
  const [amount, setAmount] = useState<number | null>(cap || null);
  const [busy, setBusy] = useState(false);
  // One key per attempt: a double-click or a retry after a timeout applies once (uq_vendor_credit_app_idempotency).
  const [key] = useState(() => `perfume-ap-${credit.id}-${Date.now()}`);
  const ok = bill && amount != null && amount > 0 && amount <= cap;
  const apply = async () => {
    if (!ok || !bill) return;
    setBusy(true);
    try {
      await applyVendorCredit(companyId, credit.id, [{ bill_id: bill.id, applied_cents: amount!, idempotency_key: key }]);
      pushToast(`${credit.display_id}: ${money(amount!)} applied to ${bill.display_id ?? "the bill"}`, "success");
      await onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Not applied"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${tr("perfume.ap.apply_title", "Apply vendor credit")} ${credit.display_id}`} size="sm" data-testid="perfume-ap-apply-modal">
      <div className="space-y-3 text-xs">
        <p>{`${tr("perfume.ap.left", "Left to apply")}: ${money(credit.unapplied_cents)}`}</p>
        <label className="block">{tr("perfume.ap.to_bill", "Apply to bill")}
          <select className={`${ctl} block w-full`} value={billId} data-testid="perfume-ap-apply-bill"
            onChange={(e) => { setBillId(e.target.value); const b = openBills.find((x) => x.id === e.target.value); setAmount(b ? Math.min(credit.unapplied_cents, b.open_cents) : null); }}>
            {openBills.map((b) => <option key={b.id} value={b.id}>{`${b.display_id ?? b.id.slice(0, 8)} · ${b.bill_number ?? ""} · balance ${money(b.open_cents)}`}</option>)}
          </select>
        </label>
        <label className="block">{tr("perfume.ap.apply_amount", "Amount")}
          <MoneyInput className="block w-[140px]" ariaLabel="Credit amount to apply" valueCents={amount} onChangeCents={setAmount} />
        </label>
        {amount != null && amount > cap ? <p className="text-[#B91C1C]" role="alert">{`${tr("perfume.ap.over", "At most")} ${money(cap)} — ${tr("perfume.ap.over_why", "the smaller of the credit left and the bill's balance.")}`}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.cat.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void apply()} data-testid="perfume-ap-apply-confirm">{tr("perfume.ap.apply_confirm", "Apply credit")}</Button>
        </div>
      </div>
    </Modal>
  );
}
