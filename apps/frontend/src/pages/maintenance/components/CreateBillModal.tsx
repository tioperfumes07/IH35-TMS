import type { JSX } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listDrivers, listUnits, listVendors } from "../../../api/mdata";
import { createVendorBill } from "../../../api/accounting";
import { Modal } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import { useToast } from "../../../components/Toast";
import { companyToday } from "../../../lib/businessDate";
import { TwoSectionLineEditor, type TwoSectionLine } from "../../../components/forms/TwoSectionLineEditor";
import { TotalsStack } from "../../../components/forms/shared/TotalsStack";
import { BILL_TYPE_TABS, TypeTabBar } from "../../../components/forms/shared/TypeTabBar";
import { DatePicker } from "../../../components/forms/DatePicker";
import { QboCombobox } from "../../../components/forms/QboCombobox";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { UploadZone } from "../../../components/UploadZone";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  /** When present, the created bill's memo carries this WO reference (human-readable maintenance linkage). */
  linkedWoDisplayId?: string;
  /** When present, the created bill persists a HARD FK (accounting.bills.work_order_id) to this WO. */
  linkedWoId?: string;
  /** When present (WO context), the created bill persists a HARD FK to this unit. Falls back to the picker. */
  linkedUnitId?: string;
  onClose: () => void;
  /** Fired after a successful create with the new bill id (e.g. to open a task-link picker). */
  onCreated?: (billId: string | null) => void;
};

export function CreateBillModal({ open, operatingCompanyId, linkedWoDisplayId, linkedWoId, linkedUnitId, onClose, onCreated }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<TwoSectionLine[]>([]);
  const [taxRate, setTaxRate] = useState(8.25);
  const [billType, setBillType] = useState("repair");
  const [draftAttachmentEntityId] = useState(() => crypto.randomUUID());
  const [billDate, setBillDate] = useState(() => companyToday());
  const [dueDate, setDueDate] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [terms, setTerms] = useState("net_30");
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [loadNumber, setLoadNumber] = useState("");
  const [driverId, setDriverId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [className, setClassName] = useState("");
  const [accountQboId, setAccountQboId] = useState<string | null>(null);
  const [accountDisplay, setAccountDisplay] = useState("");

  const vendorsQuery = useQuery({
    queryKey: ["create-bill-modal", "vendors", operatingCompanyId],
    queryFn: () => listVendors({ operating_company_id: operatingCompanyId }),
    enabled: Boolean(open && operatingCompanyId),
  });
  const driversQuery = useQuery({
    queryKey: ["create-bill-modal", "drivers", operatingCompanyId],
    queryFn: () => listDrivers({ status: "Active", operating_company_id: operatingCompanyId, limit: 200 }), // full active set (endpoint default 50 truncates >50)
    enabled: Boolean(open && operatingCompanyId),
  });
  const unitsQuery = useQuery({
    queryKey: ["create-bill-modal", "units", operatingCompanyId],
    queryFn: () => listUnits({ status: "Active", operating_company_id: operatingCompanyId }),
    enabled: Boolean(open && operatingCompanyId),
  });
  const vendorOptions = useMemo(
    () =>
      (vendorsQuery.data?.vendors ?? []).map((vendor) => ({
        value: vendor.id,
        label: vendor.name,
      })),
    [vendorsQuery.data?.vendors]
  );
  const subtotal = lines.reduce((sum, line) => {
    if (line.section === "A") return sum + Number(line.amount || 0);
    const subRowsTotal = (line.sub_rows ?? []).reduce((rowSum, row) => rowSum + Number(row.amount || 0), 0);
    return sum + Math.max(Number(line.amount || 0), subRowsTotal);
  }, 0);
  const totalCents = Math.round((subtotal + (subtotal * taxRate) / 100) * 100);

  // Compose the maintenance context into the bill memo so the created bill is CONNECTED (searchable) to
  // its work order / unit / driver / load even though the canonical bill create has no WO/unit FK column.
  function buildMemo(): string | undefined {
    const parts: string[] = [];
    const typeLabel = BILL_TYPE_TABS.find((t) => t.id === billType)?.label;
    if (typeLabel) parts.push(typeLabel);
    if (linkedWoDisplayId) parts.push(`WO: ${linkedWoDisplayId}`);
    if (loadNumber.trim()) parts.push(`Load: ${loadNumber.trim()}`);
    if (driverId) {
      const d = (driversQuery.data?.drivers ?? []).find((row) => row.id === driverId);
      const name = d ? [d.first_name, d.last_name].filter(Boolean).join(" ").trim() : "";
      if (name) parts.push(`Driver: ${name}`);
    }
    if (unitId) {
      const u = ((unitsQuery.data?.units ?? []) as Array<Record<string, unknown>>).find((row) => String(row.id ?? "") === unitId);
      const label = u ? String(u.unit_number ?? u.id ?? "") : "";
      if (label) parts.push(`Unit: ${label}`);
    }
    if (className.trim()) parts.push(`Class: ${className.trim()}`);
    return parts.length ? parts.join(" · ") : undefined;
  }

  const createMutation = useMutation({
    mutationFn: () => {
      if (!operatingCompanyId) throw new Error("Select an operating company first");
      if (!vendorId) throw new Error("Vendor is required");
      if (totalCents <= 0) throw new Error("Bill total must be greater than zero");
      if (!billDate) throw new Error("Bill date is required");
      return createVendorBill(operatingCompanyId, {
        vendor_id: vendorId,
        bill_number: billNumber.trim() || undefined,
        bill_date: billDate,
        due_date: dueDate.trim() || undefined,
        amount_cents: totalCents,
        memo: buildMemo(),
        // QboCombobox yields a QBO account id; a real catalogs.accounts uuid (contains a dash) is the GL
        // A/P account — mirror the canonical VendorBillForm mapping.
        coa_account_id: accountQboId && accountQboId.includes("-") ? accountQboId : undefined,
        // HARD cross-module link: persist the WO + unit as real FKs (forward half of the bidirectional
        // link; reverse half = WO detail "Linked Bills / Expenses"). Unit picker overrides the WO's unit.
        work_order_id: linkedWoId || undefined,
        unit_id: unitId || linkedUnitId || undefined,
        attachment_draft_id: draftAttachmentEntityId,
      });
    },
    onSuccess: (res) => {
      pushToast("Bill created", "success");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "bills"] });
      void queryClient.invalidateQueries({ queryKey: ["accounting", "bills-unpaid"] });
      void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      onCreated?.(res?.bill?.id ?? null);
      onClose();
    },
    onError: (error) => {
      pushToast(String((error as Error).message || "Failed to create bill"), "error");
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Bill"
    >
      <div className="space-y-3">
        <TypeTabBar tabs={BILL_TYPE_TABS} activeId={billType} onChange={setBillType} />

        <div className="rounded-sm border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Bill Details</div>

        <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-2 md:grid-cols-6">
          <Field label="Bill Type *">
            <input className="h-8 w-full rounded-sm border border-gray-300 bg-gray-100 px-2 text-xs" value={BILL_TYPE_TABS.find((t) => t.id === billType)?.label ?? "Repair Bill"} readOnly />
          </Field>
          <Field label="Bill Date *">
            <DatePicker className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={billDate} onChange={setBillDate} />
          </Field>
          <Field label="Terms">
            <SelectCombobox className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={terms} onChange={(event) => setTerms(event.target.value)}>
              <option value="net_30">Net 30</option>
              <option value="net_15">Net 15</option>
              <option value="net_7">Net 7</option>
            </SelectCombobox>
          </Field>
          <Field label="Due Date">
            <DatePicker className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={dueDate} onChange={setDueDate} />
          </Field>
          <Field label="Bill Number">
            <input className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={billNumber} onChange={(event) => setBillNumber(event.target.value)} placeholder="Bill Number" />
          </Field>
          <Field label="A/P Account">
            <QboCombobox
              entityType="account"
              operatingCompanyId={operatingCompanyId}
              value={accountQboId}
              displayValue={accountDisplay}
              onChange={(qboId, displayName) => {
                setAccountQboId(qboId);
                setAccountDisplay(displayName);
              }}
            />
          </Field>

          <div className="md:col-span-6 h-2" />
          <Field label="Vendor *">
            <SelectCombobox className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={vendorId ?? ""} onChange={(event) => setVendorId(event.target.value || null)}>
              <option value="">Select vendor...</option>
              {vendorOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectCombobox>
          </Field>
          <Field label="Load Number">
            <input className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" placeholder="Load Number" value={loadNumber} onChange={(event) => setLoadNumber(event.target.value)} />
          </Field>
          <div className="md:col-span-4" />

          <div className="md:col-span-6 h-2" />
          <Field label="Driver">
            <SelectCombobox className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={driverId} onChange={(event) => setDriverId(event.target.value)}>
              <option value="">Select driver...</option>
              {(driversQuery.data?.drivers ?? []).map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {[driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() || driver.id}
                </option>
              ))}
            </SelectCombobox>
          </Field>
          <Field label="Unit">
            <SelectCombobox className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={unitId} onChange={(event) => setUnitId(event.target.value)}>
              <option value="">Select unit...</option>
              {((unitsQuery.data?.units ?? []) as Array<Record<string, unknown>>).map((unit) => (
                <option key={String(unit.id ?? "")} value={String(unit.id ?? "")}>
                  {String(unit.unit_number ?? unit.id ?? "")}
                </option>
              ))}
            </SelectCombobox>
          </Field>
          <div className="md:col-span-3" />
          <Field label="Class">
            <input className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={className} onChange={(event) => setClassName(event.target.value)} placeholder="Class" />
          </Field>

          {linkedWoDisplayId ? (
            <div className="md:col-span-6 rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
              Linked - {linkedWoDisplayId}
            </div>
          ) : null}
        </div>

        <TwoSectionLineEditor mode="bill" onChange={setLines} partsLaborMode="parts-and-labor" />
        <TotalsStack subtotal={subtotal} taxRate={taxRate} onTaxRateChange={setTaxRate} grandLabel="Bill Total = A + B" />
        <UploadZone
          operatingCompanyId={operatingCompanyId}
          entityType="bill"
          entityId={draftAttachmentEntityId}
          defaultCategory="vendor_invoice"
          title="Bill Attachments"
        />

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
          <Button variant="secondary" type="button" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            data-testid="create-bill-submit"
            loading={createMutation.isPending}
            disabled={createMutation.isPending || !vendorId || totalCents <= 0}
            onClick={() => createMutation.mutate()}
          >
            Create Bill
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: JSX.Element }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-gray-600">{label}</label>
      {children}
    </div>
  );
}
