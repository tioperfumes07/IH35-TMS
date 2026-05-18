import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDrivers, listUnits, listVendors } from "../../../api/mdata";
import { Modal } from "../../../components/Modal";
import { TwoSectionLineEditor, type TwoSectionLine } from "../../../components/forms/TwoSectionLineEditor";
import { TotalsStack } from "../../../components/forms/shared/TotalsStack";
import { BILL_TYPE_TABS, TypeTabBar } from "../../../components/forms/shared/TypeTabBar";
import { QboCombobox } from "../../../components/forms/QboCombobox";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { UploadZone } from "../../../components/UploadZone";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  linkedWoDisplayId?: string;
  onClose: () => void;
};

export function CreateBillModal({ open, operatingCompanyId, linkedWoDisplayId, onClose }: Props) {
  const [lines, setLines] = useState<TwoSectionLine[]>([]);
  const [taxRate, setTaxRate] = useState(8.25);
  const [billType, setBillType] = useState("repair");
  const [draftAttachmentEntityId] = useState(() => crypto.randomUUID());
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
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
    queryFn: () => listDrivers({ status: "Active", operating_company_id: operatingCompanyId }),
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Bill"
    >
      <div className="space-y-3">
        <TypeTabBar tabs={BILL_TYPE_TABS} activeId={billType} onChange={setBillType} />

        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Bill Details</div>

        <div className="grid gap-2 rounded border border-gray-200 bg-white p-2 md:grid-cols-6">
          <Field label="Bill Type *">
            <input className="h-8 w-full rounded border border-gray-300 bg-gray-100 px-2 text-xs" value={BILL_TYPE_TABS.find((t) => t.id === billType)?.label ?? "Repair Bill"} readOnly />
          </Field>
          <Field label="Bill Date *">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" type="date" value={billDate} onChange={(event) => setBillDate(event.target.value)} />
          </Field>
          <Field label="Terms">
            <SelectCombobox className="h-8 w-full rounded border border-gray-300 px-2 text-xs" value={terms} onChange={(event) => setTerms(event.target.value)}>
              <option value="net_30">Net 30</option>
              <option value="net_15">Net 15</option>
              <option value="net_7">Net 7</option>
            </SelectCombobox>
          </Field>
          <Field label="Due Date *">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
          <Field label="Bill Number *">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" value={billNumber} onChange={(event) => setBillNumber(event.target.value)} placeholder="Bill Number" />
          </Field>
          <Field label="A/P Account *">
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
            <SelectCombobox className="h-8 w-full rounded border border-gray-300 px-2 text-xs" value={vendorId ?? ""} onChange={(event) => setVendorId(event.target.value || null)}>
              <option value="">Select vendor...</option>
              {vendorOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectCombobox>
          </Field>
          <Field label="Load Number">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Load Number" value={loadNumber} onChange={(event) => setLoadNumber(event.target.value)} />
          </Field>
          <div className="md:col-span-4" />

          <div className="md:col-span-6 h-2" />
          <Field label="Driver">
            <SelectCombobox className="h-8 w-full rounded border border-gray-300 px-2 text-xs" value={driverId} onChange={(event) => setDriverId(event.target.value)}>
              <option value="">Select driver...</option>
              {(driversQuery.data?.drivers ?? []).map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {[driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() || driver.id}
                </option>
              ))}
            </SelectCombobox>
          </Field>
          <Field label="Unit">
            <SelectCombobox className="h-8 w-full rounded border border-gray-300 px-2 text-xs" value={unitId} onChange={(event) => setUnitId(event.target.value)}>
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
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" value={className} onChange={(event) => setClassName(event.target.value)} placeholder="Class" />
          </Field>

          <div className="md:col-span-6 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
            Linked - {linkedWoDisplayId || "WO-XXXX"}
          </div>
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
