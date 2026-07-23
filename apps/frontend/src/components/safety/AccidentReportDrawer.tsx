import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addAccidentPhoto,
  createSafetyAccident,
  patchSafetyAccident,
  spawnSafetyLiability,
  spawnSafetyWo,
  type AccidentFault,
} from "../../api/safety";
import { listUnits, listVendors } from "../../api/mdata";
import { listDispatchLoads } from "../../api/dispatch";
import { Button } from "../Button";
import { DriverPickerWithCreate } from "../drivers/DriverPickerWithCreate";
import { TwoSectionLineEditor, type TwoSectionLine } from "../forms/TwoSectionLineEditor";
import { TotalsStack } from "../forms/shared/TotalsStack";
import { Combobox } from "../shared/Combobox";
import { ReferenceSelect, type ReferenceOption } from "../parity/ReferenceSelect";
import { useToast } from "../Toast";
import { companyToday } from "../../lib/businessDate";
import { DatePicker } from "../forms/DatePicker";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  accident: Record<string, unknown> | null;
  createMode?: boolean;
  onClose: () => void;
  onUpdated: () => void;
};

function textField(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function AccidentReportDrawer({ open, operatingCompanyId, accident, createMode = false, onClose, onUpdated }: Props) {
  const { pushToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [spawnedWoDisplayId, setSpawnedWoDisplayId] = useState<string | null>(null);
  const [costLines, setCostLines] = useState<TwoSectionLine[]>([]);
  const [taxRate, setTaxRate] = useState(8.25);

  // Linked entity ids captured from the four wired catalogs. SC1: these replaced the four dead
  // free-text <input> comboboxes (no data source, zero API calls). We hold the real uuid in state —
  // never the display name — and on create/save PERSIST them to safety.accident_reports
  // (driver_id/unit_id/vendor_id/load_id) via the office creator endpoint, so the accident keys to
  // real driver + unit + vendor + load records.
  // SAFE-1: real fault + DOT preventability state (was a dead hardcoded "no"). at_fault holds one of
  // yes/no/disputed (or "" = not yet assessed → persists as null). preventable is a tri-state select
  // string ("" = Undetermined→null, "true" = Preventable, "false" = Not Preventable) converted to a
  // boolean|null on submit (DOT/FMCSA preventability is distinct from fault).
  const [atFault, setAtFault] = useState<string>("");
  const [preventable, setPreventable] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const accidentId = accident ? String(accident.id ?? "") : "";

  // Derive initial state from accident prop to avoid useEffect setState warning
  const initialDriverId = accident ? String(accident.driver_id ?? "") : "";
  const initialUnitId = accident ? String(accident.unit_id ?? "") : "";
  const initialVendorId = accident ? String(accident.vendor_id ?? "") : "";
  const initialLoadId = accident ? String(accident.load_id ?? "") : "";
  const initialIncidentDate = accident ? String(accident.accident_at ?? "").slice(0, 10) : "";
  const initialMemo = accident ? String(accident.notes ?? accident.description ?? "") : "";
  const initialAtFault = accident ? String(accident.at_fault ?? "") : "";
  const initialPreventable =
    accident && accident.preventable !== null && accident.preventable !== undefined
      ? String(Boolean(accident.preventable))
      : "";

  const [driverId, setDriverId] = useState(initialDriverId);
  const [unitId, setUnitId] = useState(initialUnitId);
  const [vendorId, setVendorId] = useState(initialVendorId);
  const [loadId, setLoadId] = useState(initialLoadId);
  const [incidentDate, setIncidentDate] = useState(initialIncidentDate);
  const [memo, setMemo] = useState(initialMemo);
  // SAF-F05: these fields rendered as uncontrolled <input>s and were discarded on save. Controlled +
  // seeded from the existing record (patch mode) so they persist. accident.* reads are cast to string.
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const [policeReportNumber, setPoliceReportNumber] = useState(() => str(accident.police_report_number));
  const [insuranceClaimNumber, setInsuranceClaimNumber] = useState(() => str(accident.insurance_claim_number));
  const [location, setLocation] = useState(() => str(accident.location));
  const [thirdPartyName, setThirdPartyName] = useState(() => str(accident.third_party_name));
  const [thirdPartyPlate, setThirdPartyPlate] = useState(() => str(accident.third_party_plate));
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState(() => str(accident.vendor_invoice_number));
  const [billOrExpenseRef, setBillOrExpenseRef] = useState(() => str(accident.bill_or_expense_ref));
  // B9: Report Date is display-only (not part of the accidents create/update payload — the API has
  // no report_date column; see CreateAccidentInput/PatchAccidentInput in ../../api/safety.ts) but must
  // still use the shared calendar DatePicker like every other date field, not a raw text input.
  const [reportDate, setReportDate] = useState(() => companyToday());

  useEffect(() => {
    setDriverId(initialDriverId);
    setUnitId(initialUnitId);
    setVendorId(initialVendorId);
    setLoadId(initialLoadId);
    setIncidentDate(initialIncidentDate);
    setMemo(initialMemo);
    setAtFault(initialAtFault);
    setPreventable(initialPreventable);
  }, [accidentId, initialDriverId, initialUnitId, initialVendorId, initialLoadId, initialIncidentDate, initialMemo, initialAtFault, initialPreventable]);

  const scopeReady = open && Boolean(operatingCompanyId);

  const unitsQuery = useQuery({
    queryKey: ["accident", "units", operatingCompanyId],
    queryFn: () => listUnits({ operating_company_id: operatingCompanyId, limit: 200 }),
    enabled: scopeReady,
  });
  const vendorsQuery = useQuery({
    queryKey: ["accident", "vendors", operatingCompanyId],
    queryFn: () => listVendors({ operating_company_id: operatingCompanyId, limit: 200 }),
    enabled: scopeReady,
  });
  const loadsQuery = useQuery({
    queryKey: ["accident", "loads", operatingCompanyId],
    queryFn: () => listDispatchLoads({ operating_company_id: operatingCompanyId, view: "loads", status: [], limit: 200, offset: 0 }),
    enabled: scopeReady,
  });

  const unitOptions = useMemo(
    () =>
      (unitsQuery.data?.units ?? []).map((row, index) => {
        const rec = (row ?? {}) as Record<string, unknown>;
        const id = typeof rec.id === "string" ? rec.id : `unit-${index}`;
        const label = textField(rec, ["unit_number", "truck_number", "number"]) || id.slice(0, 8);
        return { value: id, label };
      }),
    [unitsQuery.data?.units]
  );
  const vendorOptions: ReferenceOption[] = useMemo(
    () => (vendorsQuery.data?.vendors ?? []).map((row) => ({ value: String(row.id), label: row.name || String(row.id).slice(0, 8) })),
    [vendorsQuery.data?.vendors]
  );
  const loadOptions = useMemo(
    () => (loadsQuery.data?.loads ?? []).map((row) => ({ value: String(row.id), label: row.load_number || String(row.id).slice(0, 8) })),
    [loadsQuery.data?.loads]
  );

  if (!open || !accident) return null;
  const id = accidentId;
  const canMutate = Boolean(id) && !createMode;
  const subtotal = costLines.reduce((sum, line) => {
    if (line.section === "A") return sum + Number(line.amount || 0);
    const subRowsTotal = (line.sub_rows ?? []).reduce((rowSum, row) => rowSum + Number(row.amount || 0), 0);
    return sum + Math.max(Number(line.amount || 0), subRowsTotal);
  }, 0);

  const linkPayload = {
    driver_id: driverId || null,
    unit_id: unitId || null,
    vendor_id: vendorId || null,
    load_id: loadId || null,
    accident_at: incidentDate || null,
    description: memo || null,
    // SAFE-1: send the real determinations. "" = not assessed → null; preventable maps the tri-state
    // string to boolean|null (Preventable / Not Preventable / Undetermined).
    at_fault: (atFault || null) as AccidentFault | null,
    preventable: preventable === "" ? null : preventable === "true",
    // SAF-F05: trim to null so an empty field persists as NULL, never "".
    police_report_number: policeReportNumber.trim() || null,
    insurance_claim_number: insuranceClaimNumber.trim() || null,
    location: location.trim() || null,
    third_party_name: thirdPartyName.trim() || null,
    third_party_plate: thirdPartyPlate.trim() || null,
    vendor_invoice_number: vendorInvoiceNumber.trim() || null,
    bill_or_expense_ref: billOrExpenseRef.trim() || null,
  };

  const saveAccident = () => {
    setSaving(true);
    const request = createMode
      ? createSafetyAccident({ operating_company_id: operatingCompanyId, ...linkPayload })
      : patchSafetyAccident(id, operatingCompanyId, linkPayload);
    void request
      .then(() => {
        pushToast(createMode ? "Accident report created" : "Accident report saved", "success");
        onUpdated();
        onClose();
      })
      .catch((error) => pushToast(String((error as Error).message || "Failed"), "error"))
      .finally(() => setSaving(false));
  };

  const photoGateTooltip = canMutate ? undefined : "Save the report first to attach photos";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} data-testid="accident-drawer-backdrop" />
      <aside className="fixed right-0 top-0 z-50 h-full w-[480px] max-w-[95vw] overflow-y-auto border-l border-gray-200 bg-white p-4 text-xs" data-testid="accident-report-drawer">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{createMode ? "Create Accident Report" : "Accident Damage Details"}</h3>
          <button type="button" className="text-gray-500 underline" onClick={onClose}>
            Close
          </button>
        </div>
        {createMode ? (
          <div className="mb-2 rounded-sm border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
            Office intake uses this form layout. Persisted reports also arrive from the driver mobile app or maintenance work order conversion.
          </div>
        ) : null}
        <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Accident Damage Details</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <Field label="Record Type *">
              <Combobox
                options={[
                  { value: "accident", label: "Accident" },
                  { value: "damage", label: "Damage" },
                  { value: "vandalism", label: "Vandalism" },
                ]}
                value={"accident"}
                onChange={() => {}}
              />
            </Field>
            <Field label="Service Type">
              <Combobox
                options={[
                  { value: "repair", label: "Repair" },
                  { value: "replacement", label: "Replacement" },
                  { value: "tow", label: "Tow only" },
                ]}
                value={"repair"}
                onChange={() => {}}
              />
            </Field>

            <Field label="Incident Date *">
              <DatePicker
                className="h-8 w-full rounded-sm border border-gray-300 px-2"
                data-testid="accident-incident-date"
                value={incidentDate}
                onChange={setIncidentDate}
              />
            </Field>
            <Field label="Report Date">
              <DatePicker
                className="h-8 w-full rounded-sm border border-gray-300 px-2"
                data-testid="accident-report-date"
                value={reportDate}
                onChange={setReportDate}
              />
            </Field>

            <Field label="Driver">
              <div data-testid="accident-driver-picker">
                <DriverPickerWithCreate
                  operatingCompanyId={operatingCompanyId}
                  value={driverId || null}
                  onChange={(next) => setDriverId(next ?? "")}
                  open={open}
                  shell="drawer"
                  placeholder="Search driver…"
                />
              </div>
            </Field>
            <Field label="Unit">
              <div data-testid="accident-unit-picker">
                <Combobox
                  options={unitOptions}
                  value={unitId || null}
                  placeholder="Search unit…"
                  onChange={(next) => setUnitId(next ?? "")}
                />
              </div>
            </Field>

            <Field label="Repair Vendor">
              <div data-testid="accident-vendor-picker">
                <ReferenceSelect
                  options={vendorOptions}
                  value={vendorId || null}
                  placeholder="Search vendor…"
                  onChange={(next) => setVendorId(next ?? "")}
                  createKind="vendor"
                  operatingCompanyId={operatingCompanyId}
                />
              </div>
            </Field>
            <Field label="Load">
              <div data-testid="accident-load-picker">
                <Combobox
                  options={loadOptions}
                  value={loadId || null}
                  placeholder="Search load…"
                  onChange={(next) => setLoadId(next ?? "")}
                />
              </div>
            </Field>

            <Field label="At Fault">
              <div data-testid="accident-at-fault">
                <Combobox
                  options={[
                    { value: "no", label: "No" },
                    { value: "yes", label: "Yes" },
                    { value: "disputed", label: "Disputed" },
                  ]}
                  value={atFault || null}
                  placeholder="Not assessed"
                  onChange={(next) => setAtFault(next ?? "")}
                />
              </div>
            </Field>
            <Field label="Preventable (DOT)">
              <div data-testid="accident-preventable">
                <Combobox
                  options={[
                    { value: "true", label: "Preventable" },
                    { value: "false", label: "Not Preventable" },
                  ]}
                  value={preventable || null}
                  placeholder="Undetermined"
                  onChange={(next) => setPreventable(next ?? "")}
                />
              </div>
            </Field>
            <Field label="Class">
              <input className="h-8 w-full rounded-sm border border-gray-300 bg-gray-100 px-2" readOnly value="Auto class" />
            </Field>
            <div />

            <Field label="Police Report Number">
              <input
                data-testid="accident-police-report-number"
                className="h-8 w-full rounded-sm border border-gray-300 px-2"
                value={policeReportNumber}
                onChange={(e) => setPoliceReportNumber(e.target.value)}
              />
            </Field>
            <Field label="Insurance Claim Number">
              <input
                data-testid="accident-insurance-claim-number"
                className="h-8 w-full rounded-sm border border-gray-300 px-2"
                value={insuranceClaimNumber}
                onChange={(e) => setInsuranceClaimNumber(e.target.value)}
              />
            </Field>

            <Field label="Bill or Expense Number (if applicable)">
              <input
                data-testid="accident-bill-or-expense-ref"
                className="h-8 w-full rounded-sm border border-gray-300 px-2"
                value={billOrExpenseRef}
                onChange={(e) => setBillOrExpenseRef(e.target.value)}
              />
            </Field>
            <Field label="3rd Party Name">
              <input
                data-testid="accident-third-party-name"
                className="h-8 w-full rounded-sm border border-gray-300 px-2"
                value={thirdPartyName}
                onChange={(e) => setThirdPartyName(e.target.value)}
              />
            </Field>

            <Field label="3rd Party Plate">
              <input
                data-testid="accident-third-party-plate"
                className="h-8 w-full rounded-sm border border-gray-300 px-2"
                value={thirdPartyPlate}
                onChange={(e) => setThirdPartyPlate(e.target.value)}
              />
            </Field>
            <div />

            <Field label="Location" className="col-span-2">
              <input
                data-testid="accident-location"
                className="h-8 w-full rounded-sm border border-gray-300 px-2"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </Field>
            <Field label="Vendor Invoice" className="col-span-2">
              <input
                data-testid="accident-vendor-invoice-number"
                className="h-8 w-full rounded-sm border border-gray-300 px-2"
                value={vendorInvoiceNumber}
                onChange={(e) => setVendorInvoiceNumber(e.target.value)}
              />
            </Field>
            <Field label="Memo" className="col-span-2">
              <textarea
                className="w-full rounded-sm border border-gray-300 px-2 py-1"
                rows={2}
                data-testid="accident-memo"
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
              />
            </Field>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button size="sm" disabled={saving} data-testid="accident-save-btn" onClick={saveAccident}>
            {saving ? "Saving…" : createMode ? "+ Create Accident Report" : "Save Changes"}
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!canMutate}
            onClick={() =>
              void spawnSafetyLiability(id, operatingCompanyId)
                .then(() => {
                  pushToast("Spawn liability requested", "success");
                  onUpdated();
                })
                .catch((error) => pushToast(String((error as Error).message || "Failed"), "error"))
            }
          >
            Spawn Liability
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!canMutate}
            onClick={() =>
              void spawnSafetyWo(id, operatingCompanyId)
                .then((payload) => {
                  const displayId = String(payload.spawned_wo_display_id ?? "");
                  setSpawnedWoDisplayId(displayId || null);
                  pushToast(displayId ? `Spawn WO created (${displayId})` : "Spawn WO requested", "success");
                  onUpdated();
                })
                .catch((error) => pushToast(String((error as Error).message || "Failed"), "error"))
            }
          >
            Spawn WO
          </Button>
          <label
            className={`rounded-sm border border-gray-300 px-2 py-1 text-center ${canMutate ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
            title={photoGateTooltip}
            data-testid="accident-photo-label"
          >
            <input
              type="file"
              className="hidden"
              disabled={!canMutate}
              data-testid="accident-photo-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file || !canMutate) return;
                setUploading(true);
                void addAccidentPhoto(id, operatingCompanyId, file)
                  .then(() => {
                    pushToast("Photo added", "success");
                    onUpdated();
                  })
                  .catch((error) => pushToast(String((error as Error).message || "Failed"), "error"))
                  .finally(() => setUploading(false));
              }}
            />
            {uploading ? "Uploading..." : "Add Photo"}
          </label>
        </div>
        {!canMutate ? (
          <div className="mt-1 text-[10px] text-slate-500" data-testid="accident-photo-gate-note">
            Save the report first to attach photos.
          </div>
        ) : null}
        {spawnedWoDisplayId ? (
          <div className="mt-2 rounded-sm border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] text-slate-700">
            New WO (source type AC): {spawnedWoDisplayId}
          </div>
        ) : null}
        <div className="mt-3">
          <TwoSectionLineEditor mode="expense" onChange={setCostLines} partsLaborMode="parts-and-labor" />
        </div>
        <div className="mt-2">
          <TotalsStack subtotal={subtotal} taxRate={taxRate} onTaxRateChange={setTaxRate} grandLabel="Accident Total = A + B" />
        </div>
      </aside>
    </>
  );
}

function Field({ label, children, className }: { label: string; children: JSX.Element; className?: string }) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <label className="text-[10px] font-semibold uppercase text-gray-600">{label}</label>
      {children}
    </div>
  );
}
