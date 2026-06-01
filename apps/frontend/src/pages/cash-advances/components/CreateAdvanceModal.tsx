import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createCashAdvance, listUnpaidBills, type CashAdvanceMethod, type CashAdvancePurpose } from "../../../api/cashAdvances";
import { listDrivers } from "../../../api/mdata";
import { Button } from "../../../components/Button";
import { useToast } from "../../../components/Toast";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
};

const PURPOSE_OPTIONS: Array<{ value: CashAdvancePurpose; label: string }> = [
  { value: "fuel_deposit", label: "Fuel deposit" },
  { value: "border_fee", label: "Border fee" },
  { value: "family_emergency", label: "Family emergency" },
  { value: "vendor_payment", label: "Vendor payment" },
  { value: "other", label: "Other" },
];

const METHOD_OPTIONS: Array<{ value: CashAdvanceMethod; label: string }> = [
  { value: "direct_bank_transfer", label: "Direct bank transfer (BOA / IBC checking)" },
  { value: "wire", label: "Wire (3rd party)" },
  { value: "comdata", label: "Comdata / EFS card load" },
  { value: "in_person_check", label: "In-person check" },
];

const PHASE4_APPROVAL_MESSAGE = "Owner approval required — feature available Phase 4";

export function CreateAdvanceModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const { pushToast } = useToast();
  const [driverId, setDriverId] = useState("");
  const [amount, setAmount] = useState("300");
  const [purpose, setPurpose] = useState<CashAdvancePurpose>("fuel_deposit");
  const [method, setMethod] = useState<CashAdvanceMethod>("direct_bank_transfer");
  const [recipientName, setRecipientName] = useState("");
  const [linkedBillEnabled, setLinkedBillEnabled] = useState(false);
  const [linkedBillId, setLinkedBillId] = useState("");
  const [periods, setPeriods] = useState(4);
  const [weeklyAmount, setWeeklyAmount] = useState("75");
  const [cadence, setCadence] = useState<"weekly" | "biweekly">("weekly");
  const [abovePolicyWarn, setAbovePolicyWarn] = useState<string | null>(null);

  const driversQuery = useQuery({
    queryKey: ["cash-advances", "drivers"],
    queryFn: () => listDrivers({ status: "Active", search: "" }),
    enabled: open,
  });
  const billsQuery = useQuery({
    queryKey: ["cash-advances", "unpaid-bills", operatingCompanyId],
    queryFn: () => listUnpaidBills(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
  });

  const selectedBill = useMemo(
    () => billsQuery.data?.bills.find((row) => String(row.id) === linkedBillId) ?? null,
    [billsQuery.data?.bills, linkedBillId]
  );

  const createMutation = useMutation({
    mutationFn: () =>
      createCashAdvance(operatingCompanyId, {
        driver_id: driverId,
        amount: Number(amount || "0"),
        purpose,
        disbursement_method: method,
        recipient_info: {
          recipient_type: linkedBillEnabled ? "vendor" : "driver",
          recipient_name: recipientName || undefined,
        },
        linked_bill_id: linkedBillEnabled && linkedBillId ? linkedBillId : undefined,
        repayment_schedule: {
          weekly_installment_amount: Number(weeklyAmount || "0"),
          total_periods: periods,
          cadence,
        },
      }),
    onSuccess: () => {
      pushToast("Cash advance created", "success");
      onCreated();
    },
    onError: (error) => {
      const message = String((error as Error).message ?? "Failed to create advance");
      if (message.includes("above_policy_owner_approval_required") || message.includes("403")) {
        setAbovePolicyWarn(PHASE4_APPROVAL_MESSAGE);
        pushToast(PHASE4_APPROVAL_MESSAGE, "error");
        return;
      }
      pushToast(message, "error");
    },
  });

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed inset-x-0 top-8 z-50 mx-auto w-full max-w-3xl rounded border border-gray-200 bg-white p-4 text-xs shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Create Advance</h3>
          <button type="button" className="text-gray-500 underline" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span>Driver</span>
            <SelectCombobox className="w-full rounded border border-gray-300 px-2 py-1" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">Select driver</option>
              {(driversQuery.data?.drivers ?? []).map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.first_name} {driver.last_name}
                </option>
              ))}
            </SelectCombobox>
          </label>
          <label className="space-y-1">
            <span>Amount</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span>Purpose</span>
            <SelectCombobox className="w-full rounded border border-gray-300 px-2 py-1" value={purpose} onChange={(e) => setPurpose(e.target.value as CashAdvancePurpose)}>
              {PURPOSE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectCombobox>
          </label>
          <label className="space-y-1">
            <span>Disbursement Method</span>
            <SelectCombobox className="w-full rounded border border-gray-300 px-2 py-1" value={method} onChange={(e) => setMethod(e.target.value as CashAdvanceMethod)}>
              {METHOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectCombobox>
          </label>
          <label className="space-y-1 md:col-span-2">
            <span>Recipient Name (wire / check / vendor)</span>
            <input
              className="w-full rounded border border-gray-300 px-2 py-1"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Recipient name"
            />
          </label>
        </div>

        <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-2">
          <div className="mb-1 flex items-center justify-between">
            <div className="font-semibold">Bill Payment Linkage</div>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={linkedBillEnabled} onChange={(e) => setLinkedBillEnabled(e.target.checked)} />
              Apply this advance directly to a vendor bill
            </label>
          </div>
          {linkedBillEnabled ? (
            <div className="grid gap-2 md:grid-cols-2">
              <label className="space-y-1">
                <span>Unpaid Bill</span>
                <SelectCombobox
                  className="w-full rounded border border-gray-300 px-2 py-1"
                  value={linkedBillId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setLinkedBillId(value);
                    const bill = (billsQuery.data?.bills ?? []).find((row) => String(row.id) === value);
                    if (bill?.total_amount != null) {
                      setAmount(String(Number(bill.total_amount)));
                    }
                  }}
                >
                  <option value="">Select unpaid bill</option>
                  {(billsQuery.data?.bills ?? []).map((bill) => (
                    <option key={String(bill.id)} value={String(bill.id)}>
                      {String(bill.display_id)} · ${Number(bill.total_amount ?? 0).toFixed(2)}
                    </option>
                  ))}
                </SelectCombobox>
              </label>
              <div className="rounded border border-blue-100 bg-white p-2">
                <div>Bill amount auto-fills advance amount.</div>
                <div>Recipient becomes vendor on disbursement.</div>
                {selectedBill ? <div className="mt-1">Selected: {String(selectedBill.display_id)}</div> : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-3 rounded border border-gray-200 p-2">
          <div className="mb-1 font-semibold">Repayment Schedule</div>
          <div className="grid gap-2 md:grid-cols-3">
            <label className="space-y-1">
              <span>Periods</span>
              <input
                type="number"
                min={1}
                max={104}
                className="w-full rounded border border-gray-300 px-2 py-1"
                value={periods}
                onChange={(e) => {
                  const nextPeriods = Number(e.target.value || "1");
                  setPeriods(nextPeriods);
                  const parsedAmount = Number(amount || "0");
                  if (nextPeriods > 0 && parsedAmount > 0) {
                    setWeeklyAmount((parsedAmount / nextPeriods).toFixed(2));
                  }
                }}
              />
            </label>
            <label className="space-y-1">
              <span>Per Period Amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded border border-gray-300 px-2 py-1"
                value={weeklyAmount}
                onChange={(e) => setWeeklyAmount(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span>Cadence</span>
              <SelectCombobox className="w-full rounded border border-gray-300 px-2 py-1" value={cadence} onChange={(e) => setCadence(e.target.value as "weekly" | "biweekly")}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
              </SelectCombobox>
            </label>
          </div>
          <div className="mt-1 text-gray-600">Auto-suggest default: 4 weekly installments.</div>
        </div>

        {abovePolicyWarn ? <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-amber-800">{abovePolicyWarn}</div> : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            loading={createMutation.isPending}
            onClick={() => {
              if (!driverId) {
                pushToast("Driver is required", "error");
                return;
              }
              if (linkedBillEnabled && !linkedBillId) {
                pushToast("Select an unpaid bill to link this advance to", "error");
                return;
              }
              if (Number(amount) <= 0) {
                pushToast("Amount must be greater than 0", "error");
                return;
              }
              createMutation.mutate();
            }}
          >
            + Create Advance
          </Button>
        </div>
      </div>
    </>
  );
}
