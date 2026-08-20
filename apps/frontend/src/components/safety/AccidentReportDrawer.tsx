import { entityLabel } from "../../lib/entity-label";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addAccidentPhoto,
  createSafetyAccident,
  getSafetyAccidentDetail,
  patchSafetyAccident,
  spawnSafetyLiability,
  spawnSafetyWo,
  type AccidentFault,
} from "../../api/safety";
import { suggestExpenseLoad } from "../../api/maintenance";
import { Button } from "../Button";
import { EntityLink } from "../shared/EntityLink";
import { ExpensesReverseSection } from "../accounting/ExpensesReverseSection";
import { BillsReverseSection } from "../accounting/BillsReverseSection";
import { ParityDrawer } from "../parity/ParityDrawer";
import { DriverPickerWithCreate } from "../drivers/DriverPickerWithCreate";
import { TwoSectionLineEditor, type TwoSectionLine } from "../forms/TwoSectionLineEditor";
import { TotalsStack } from "../forms/shared/TotalsStack";
import { Combobox } from "../shared/Combobox";
import { EntityPicker } from "../parity/EntityPicker";
import { ReferenceSelect } from "../parity/ReferenceSelect";
import { useToast } from "../Toast";
import { companyToday } from "../../lib/businessDate";
import { userFacingApiError } from "../../lib/api-error-message";
import { DatePicker } from "../forms/DatePicker";
import { apiRequest } from "../../api/client";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  accident: Record<string, unknown> | null;
  createMode?: boolean;
  onClose: () => void;
  onUpdated: () => void;
};

export function AccidentReportDrawer({ open, operatingCompanyId, accident, createMode = false, onClose, onUpdated }: Props) {
  const { pushToast } = useToast();
  const [uploading, setUploading] = useState(false);
  // SAF-F31: EntityPicker owns unit/load/vendor server-search.
  // SAF-B30 / F35: list of AC WOs linked by description token — survives reload (not React-only).
  const [spawnedWorkOrders, setSpawnedWorkOrders] = useState<Array<{ id: string; display_id: string }>>([]);
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
  const initialDriverName = accident ? String(accident.driver_name ?? "").trim() : "";
  const initialUnitId = accident ? String(accident.unit_id ?? "") : "";
  const initialTrailerId = accident ? String(accident.trailer_id ?? "") : "";
  const initialVendorId = accident ? String(accident.vendor_id ?? "") : "";
  const initialLoadId = accident ? String(accident.load_id ?? "") : "";
  const initialLoadName = accident ? String(accident.load_number ?? "").trim() : "";
  const initialIncidentDate = accident ? String(accident.accident_at ?? "").slice(0, 10) : "";
  const initialMemo = accident ? String(accident.notes ?? accident.description ?? "") : "";
  const initialAtFault = accident ? String(accident.at_fault ?? "") : "";
  const initialPreventable =
    accident && accident.preventable !== null && accident.preventable !== undefined
      ? String(Boolean(accident.preventable))
      : "";

  const [driverId, setDriverId] = useState(initialDriverId);
  const [unitId, setUnitId] = useState(initialUnitId);
  const [trailerId, setTrailerId] = useState(initialTrailerId);
  const [vendorId, setVendorId] = useState(initialVendorId);
  const [loadId, setLoadId] = useState(initialLoadId);
  const [incidentDate, setIncidentDate] = useState(initialIncidentDate);
  /** Once the active-trip resolver fills the load, preserve an operator override. */
  const [suggestionPinned, setSuggestionPinned] = useState(false);
  const [memo, setMemo] = useState(initialMemo);
  // SAF-F05: these fields rendered as uncontrolled <input>s and were discarded on save. Controlled +
  // seeded from the existing record (patch mode) so they persist. accident.* reads are cast to string.
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const [policeReportNumber, setPoliceReportNumber] = useState(() => str(accident?.police_report_number));
  const [insuranceClaimNumber, setInsuranceClaimNumber] = useState(() => str(accident?.insurance_claim_number));
  const [location, setLocation] = useState(() => str(accident?.location));
  const [thirdPartyName, setThirdPartyName] = useState(() => str(accident?.third_party_name));
  const [thirdPartyPlate, setThirdPartyPlate] = useState(() => str(accident?.third_party_plate));
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState(() => str(accident?.vendor_invoice_number));
  const [billOrExpenseRef, setBillOrExpenseRef] = useState(() => str(accident?.bill_or_expense_ref));
  // B9: Report Date is display-only (not part of the accidents create/update payload — the API has
  // no report_date column; see CreateAccidentInput/PatchAccidentInput in ../../api/safety.ts) but must
  // still use the shared calendar DatePicker like every other date field, not a raw text input.
  const [reportDate, setReportDate] = useState(() => companyToday());
  const [recordType, setRecordType] = useState<"accident" | "damage" | "vandalism">(() => {
    const v = str(accident?.record_type);
    return v === "damage" || v === "vandalism" ? v : "accident";
  });
  const [accidentTypeId, setAccidentTypeId] = useState(() => str(accident?.accident_type_id));
  const [serviceType, setServiceType] = useState<"repair" | "replacement" | "tow">(() => {
    const v = str(accident?.service_type);
    return v === "replacement" || v === "tow" ? v : "repair";
  });

  useEffect(() => {
    setDriverId(initialDriverId);
    setUnitId(initialUnitId);
    setTrailerId(initialTrailerId);
    setVendorId(initialVendorId);
    setLoadId(initialLoadId);
    setIncidentDate(initialIncidentDate);
    setMemo(initialMemo);
    setAtFault(initialAtFault);
    setPreventable(initialPreventable);
    setSuggestionPinned(false);
  }, [accidentId, initialDriverId, initialUnitId, initialTrailerId, initialVendorId, initialLoadId, initialIncidentDate, initialMemo, initialAtFault, initialPreventable]);

  const scopeReady = open && Boolean(operatingCompanyId);
  const detailReady = scopeReady && !createMode && Boolean(accidentId) && accidentId !== "__create__";

  // Create-path trip wiring: stamp active load from driver/unit/trailer + incident date (same resolver as
  // expense/fine/claim). Never overwrite an operator-selected load (suggestionPinned).
  const suggestionQuery = useQuery({
    queryKey: ["safety", "accident-create", "suggest-load", operatingCompanyId, driverId, unitId, trailerId, incidentDate],
    queryFn: () =>
      suggestExpenseLoad({
        operating_company_id: operatingCompanyId,
        driver_id: driverId || undefined,
        unit_id: unitId || undefined,
        trailer_id: trailerId || undefined,
        transaction_date: incidentDate,
      }),
    enabled: open && createMode && Boolean(operatingCompanyId && incidentDate && (driverId || unitId || trailerId)),
  });

  useEffect(() => {
    if (!createMode) return;
    setSuggestionPinned(false);
  }, [createMode, driverId, unitId, trailerId, incidentDate]);

  useEffect(() => {
    if (!createMode) return;
    if (loadId || suggestionPinned) return;
    const suggested = suggestionQuery.data?.data;
    if (!suggested?.load_id) return;
    setLoadId(suggested.load_id);
    setSuggestionPinned(true);
  }, [createMode, loadId, suggestionPinned, suggestionQuery.data]);

  // Hydrate previously spawned WOs from GET detail (server lists by description token).
  const detailQuery = useQuery({
    queryKey: ["safety", "accident-detail", operatingCompanyId, accidentId],
    queryFn: () => getSafetyAccidentDetail(accidentId, operatingCompanyId),
    enabled: detailReady,
  });

  useEffect(() => {
    const rows = detailQuery.data?.spawned_work_orders;
    if (!Array.isArray(rows)) return;
    setSpawnedWorkOrders(
      rows
        .map((row) => {
          const rec = row as { id?: unknown; display_id?: unknown };
          const id = typeof rec.id === "string" ? rec.id : "";
          const display_id = entityLabel(typeof rec.display_id === "string" ? rec.display_id : null, id, "Work order");
          return id ? { id, display_id } : null;
        })
        .filter((r): r is { id: string; display_id: string } => r != null)
    );
  }, [detailQuery.data]);

  const accidentTypesQuery = useQuery({
    queryKey: ["accident-types", operatingCompanyId],
    queryFn: () => apiRequest<{ rows: Array<{ id: string; code: string; display_name: string }> }>(`/api/v1/catalogs/safety/accident-types?operating_company_id=${encodeURIComponent(operatingCompanyId)}&is_active=true&limit=200`),
    enabled: scopeReady,
  });

  if (!open || !accident) return null;
  const id = accidentId;
  const canMutate = Boolean(id) && !createMode;
  const subtotal = costLines.reduce((sum, line) => {
    if (line.section === "A") return sum + Number(line.amount || 0);
    const subRowsTotal = (line.sub_rows ?? []).reduce((rowSum, row) => rowSum + Number(row.amount || 0), 0);
    return sum + Math.max(Number(line.amount || 0), subRowsTotal);
  }, 0);

  const linkPayload = {
    accident_type_id: accidentTypeId,
    driver_id: driverId || null,
    unit_id: unitId || null,
    trailer_id: trailerId || null,
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
    record_type: recordType,
    service_type: serviceType,
    report_date: reportDate || null,
    tax_rate_pct: taxRate,
    cost_lines: costLines.map((line, index) => ({
      section: (line.section === "B" ? "B" : "A") as "A" | "B",
      description: String(line.description ?? ""),
      amount_cents: Math.round(Number(line.amount || 0) * 100),
      sort_order: index,
    })),
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
      .catch((error) => pushToast(userFacingApiError(error, "Request failed"), "error"))
      .finally(() => setSaving(false));
  };

  const photoGateTooltip = canMutate ? undefined : "Save the report first to attach photos";

  return (
    <>
      {/* SAF-F25: was a bespoke <aside> plus a hand-rolled backdrop — a THIRD drawer implementation
          with its own z-index, width, close affordance and no shared escape/focus handling. Every
          drawer-chrome fix had to be repeated here and this copy drifted. ParityDrawer is the single
          surface (Law §3). The evidence/photo body is unchanged. */}
      <ParityDrawer
        open
        onClose={onClose}
        title={createMode ? "Create Accident Report" : "Accident Damage Details"}
      >
        <div className="text-xs" data-testid="accident-report-drawer">
        {createMode ? (
          <div className="mb-2 rounded-sm border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
            Office intake uses this form layout. Persisted reports also arrive from the driver mobile app or maintenance work order conversion.
          </div>
        ) : null}
        <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Accident Damage Details</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <Field label="Record Type *">
              <ReferenceSelect
                value={accidentTypeId || null}
                onChange={(next) => {
                  setAccidentTypeId(next ?? "");
                  // P44/catalogs.accident_types is a free-text-code catalog (createKind="accident_type"
                  // lets an operator "+ Add new" any code, e.g. "ROLLOVER") — but safety.accidents.
                  // record_type stays the narrow legacy z.enum(["accident","damage","vandalism"])
                  // still read live by SafetyHomeTab/FinesPage. Only updating recordType for the 3
                  // canonical codes left it STALE (silently reused the previous — possibly wrong —
                  // value) whenever a custom accident type was picked. Always resolve it on every
                  // change, falling back to "accident" for a non-canonical code — the same default
                  // this field's own initial state already applies to an unrecognized value.
                  const row = accidentTypesQuery.data?.rows?.find((item) => item.id === next);
                  const code = row?.code?.toLowerCase();
                  setRecordType(code === "damage" || code === "vandalism" ? code : "accident");
                }}
                options={(accidentTypesQuery.data?.rows ?? []).map((row) => ({ value: row.id, label: row.display_name, type: row.code }))}
                createKind="accident_type"
                operatingCompanyId={operatingCompanyId}
                loading={accidentTypesQuery.isLoading}
                onOptionCreated={() => void accidentTypesQuery.refetch()}
              />
            </Field>
            <Field label="Service Type">
              <Combobox
                options={[
                  { value: "repair", label: "Repair" },
                  { value: "replacement", label: "Replacement" },
                  { value: "tow", label: "Tow only" },
                ]}
                value={serviceType}
                onChange={(next) => setServiceType((next as "repair" | "replacement" | "tow") || "repair")}
              />
            </Field>

            <Field label="Incident Date *">
              <DatePicker
                className="h-8 w-full"
                data-testid="accident-incident-date"
                value={incidentDate}
                onChange={setIncidentDate}
              />
            </Field>
            <Field label="Report Date">
              <DatePicker
                className="h-8 w-full"
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
                  selectedOption={
                    initialDriverId && initialDriverName
                      ? { value: initialDriverId, label: initialDriverName }
                      : null
                  }
                  onChange={(next) => setDriverId(next ?? "")}
                  open={open}
                  shell="drawer"
                  placeholder="Search driver…"
                />
              </div>
            </Field>
            <Field label="Unit">
              <div data-testid="accident-unit-picker">
                <EntityPicker
                  kind="unit"
                  operatingCompanyId={operatingCompanyId}
                  value={unitId || null}
                  onChange={(next) => setUnitId(next ?? "")}
                  allowCreate
                  nestedInDrawer
                  enabled={open && scopeReady}
                  placeholder="Search unit…"
                  className="w-full"
                  dataField="accident-unit"
                  dataTestId="accident-unit"
                />
              </div>
            </Field>

            <Field label="Trailer">
              <div data-testid="accident-trailer-picker">
                <EntityPicker
                  kind="trailer"
                  operatingCompanyId={operatingCompanyId}
                  value={trailerId || null}
                  onChange={(next) => setTrailerId(next ?? "")}
                  allowCreate
                  nestedInDrawer
                  enabled={open && scopeReady}
                  placeholder="Search trailer…"
                  className="w-full"
                  dataField="accident-trailer"
                  dataTestId="accident-trailer"
                  allowClear
                />
              </div>
            </Field>

            <Field label="Repair Vendor">
              <div data-testid="accident-vendor-picker">
                <EntityPicker
                  kind="vendor"
                  allowCreate
                  operatingCompanyId={operatingCompanyId}
                  value={vendorId || null}
                  onChange={(next) => setVendorId(next ?? "")}
                  nestedInDrawer
                  enabled={open && scopeReady}
                  placeholder="Search vendor…"
                  className="w-full"
                  dataField="accident-vendor"
                  dataTestId="accident-vendor"
                />
              </div>
            </Field>
            <Field label="Load">
              <div data-testid="accident-load-picker">
                <EntityPicker
                  kind="load"
                  operatingCompanyId={operatingCompanyId}
                  value={loadId || null}
                  selectedOption={
                    initialLoadId && initialLoadName
                      ? { value: initialLoadId, label: initialLoadName }
                      : null
                  }
                  onChange={(next) => {
                    setLoadId(next ?? "");
                    setSuggestionPinned(true);
                  }}
                  // CREATE drawer owes picker_law: + Add new load must be first row (Book Load).
                  // allowCreate={false} blocked accidents.create Live credit (P14 Box4).
                  allowCreate
                  nestedInDrawer
                  enabled={open && scopeReady}
                  placeholder="Search load…"
                  className="w-full"
                  dataField="accident-load"
                  dataTestId="accident-load"
                />
                {createMode && suggestionPinned && loadId && suggestionQuery.data?.data?.load_id === loadId ? (
                  <p className="mt-1 text-[11px] text-slate-600" data-testid="accident-create-load-suggested">
                    Auto-filled from the active trip for this driver/unit on the incident date.
                  </p>
                ) : null}
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
              {/* SAF-F05 honesty: was a fake read-only "Auto class" string with no column and no
                  formula — operators treated it as a stored classification. Until a real CSA/DOT
                  class is modeled + persisted, show undetermined rather than invent a value. */}
              <input
                data-testid="accident-class"
                className="h-8 w-full rounded-sm border border-gray-300 bg-gray-100 px-2 text-slate-600"
                readOnly
                value="Not classified"
                title="No accident class is stored yet — value is not auto-computed"
              />
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
              {/* C-04: this input is free text (accountingTextField on the API) — a dispatcher can
                  type ANY string here, so it can never be trusted as a resolvable id and must never
                  be turned into a fabricated link. When a real insurance.claim row IS linked to this
                  accident (accident_report_id FK, joined server-side into claim_id/claim_number by
                  C-02's LATERAL join on GET /api/v1/safety/accidents), show the honest drill-through
                  to it alongside the free-text field rather than replacing it — the number recorded
                  here may predate or differ from the linked claim's own number. No claim_id → render
                  nothing extra; the free-text field alone stays exactly as honest as it always was. */}
              {typeof accident?.claim_id === "string" && accident.claim_id ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  Linked claim:{" "}
                  <EntityLink
                    kind="claim"
                    id={accident.claim_id}
                    label={typeof accident.claim_number === "string" && accident.claim_number.trim() ? accident.claim_number : "Claim"}
                    data-testid="accident-linked-claim"
                  />
                </p>
              ) : null}
              {/* LIABILITY column-wave: Spawn Liability (button above) previously only toasted success —
                  the created id was never persisted or re-rendered, so reopening the drawer showed no
                  trace of it. GET /api/v1/safety/accidents/:id now reverse-JOINs
                  driver_finance.driver_liabilities by origin='safety_accident'/origin_id and returns
                  spawned_liability_id; render it the same honest-drill way as the claim link above. */}
              {typeof accident?.spawned_liability_id === "string" && accident.spawned_liability_id ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  Spawned liability:{" "}
                  <EntityLink
                    kind="liability"
                    id={accident.spawned_liability_id}
                    label="Liability"
                    data-testid="accident-spawned-liability"
                  />
                </p>
              ) : null}
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
                .then((payload) => {
                  // SAF-F35: never toast success when no liability id was created.
                  const liabilityId = payload?.spawned_liability_id;
                  if (liabilityId == null || liabilityId === "") {
                    pushToast(
                      "Spawn Liability failed — no liability id returned. Check cost lines and driver.",
                      "error",
                    );
                    return;
                  }
                  const reused = Boolean((payload as { reused?: boolean }).reused);
                  pushToast(
                    reused ? "Existing accident liability reused" : "Spawn liability created",
                    "success",
                  );
                  onUpdated();
                })
                .catch((error) =>
                  pushToast(
                    String(
                      (error as Error).message ||
                        "Spawn Liability failed — add positive cost lines and an active driver, then retry.",
                    ),
                    "error",
                  ),
                )
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
                  const woId = String(payload.spawned_wo_id ?? "");
                  const reused = Boolean(payload.reused);
                  const list = Array.isArray(payload.spawned_work_orders)
                    ? (payload.spawned_work_orders as Array<{ id?: unknown; display_id?: unknown }>)
                        .map((row) => {
                          const rid = typeof row.id === "string" ? row.id : "";
                          const d = entityLabel(typeof row.display_id === "string" ? row.display_id : null, rid, "Work order");
                          return rid ? { id: rid, display_id: d } : null;
                        })
                        .filter((r): r is { id: string; display_id: string } => r != null)
                    : woId
                      ? [{ id: woId, display_id: entityLabel(displayId, woId, "Work order") }]
                      : [];
                  if (list.length) setSpawnedWorkOrders(list);
                  pushToast(
                    reused
                      ? displayId
                        ? `Existing AC work order reused (${displayId})`
                        : "Existing AC work order reused"
                      : displayId
                        ? `Spawn WO created (${displayId})`
                        : "Spawn WO requested",
                    "success"
                  );
                  void detailQuery.refetch();
                  onUpdated();
                })
                .catch((error) => pushToast(userFacingApiError(error, "Request failed"), "error"))
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
                  .catch((error) => pushToast(userFacingApiError(error, "Request failed"), "error"))
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
        {spawnedWorkOrders.length > 0 ? (
          <div
            className="mt-2 rounded-sm border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] text-slate-700"
            data-testid="accident-spawned-wo"
          >
            <div className="font-semibold text-slate-600">Linked AC work orders</div>
            <ul className="mt-1 space-y-0.5">
              {spawnedWorkOrders.map((wo) => (
                <li key={wo.id}>
                  <EntityLink
                    kind="work_order"
                    id={wo.id}
                    label={entityLabel(wo.display_id, wo.id, "Work order")}
                    className="font-semibold text-slate-700 underline"
                    data-testid={`accident-spawned-wo-link-${wo.id}`}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {/* ACCT-F5040 — when a real insurance.claim is linked (claim_id), reverse_link expenses+bills
            already stamped with insurance_claim_id. Free-text claim number alone never invents a FK. */}
        {typeof accident?.claim_id === "string" && accident.claim_id && operatingCompanyId ? (
          <div className="mt-3 space-y-2" data-testid="accident-claim-financial-reverse">
            <ExpensesReverseSection
              operatingCompanyId={operatingCompanyId}
              filter={{ insurance_claim_id: String(accident.claim_id) }}
              contextLabel="the linked claim"
              data-testid="accident-claim-expenses-reverse"
            />
            <BillsReverseSection
              operatingCompanyId={operatingCompanyId}
              filter={{ insurance_claim_id: String(accident.claim_id) }}
              contextLabel="the linked claim"
              data-testid="accident-claim-bills-reverse"
            />
          </div>
        ) : null}
        <div className="mt-3">
          <TwoSectionLineEditor mode="expense" onChange={setCostLines} partsLaborMode="parts-and-labor" />
        </div>
        <div className="mt-2">
          <TotalsStack
            subtotal={subtotal}
            taxRate={taxRate}
            taxRateMode="editable"
            onTaxRateChange={setTaxRate}
            grandLabel="Accident Total = A + B"
          />
        </div>
        </div>
      </ParityDrawer>
    </>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <label className="text-[10px] font-semibold uppercase text-gray-600">{label}</label>
      {children}
    </div>
  );
}
