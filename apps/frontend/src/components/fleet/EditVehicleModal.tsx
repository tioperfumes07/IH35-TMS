import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../components/Toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { patchUnit } from "../../api/mdata";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { FieldSet } from "../forms/FieldSet";
import { FormField } from "../forms/FormField";
import type { FleetRow } from "../FleetTable";

export const EDIT_VEHICLE_MODAL_TABS = [
  "Identity",
  "Insurance",
  "IRP / Plates",
  "Reefer",
  "Financial",
  "Lifecycle",
  "Quick-availability",
  "Documents",
] as const;

type TabId = (typeof EDIT_VEHICLE_MODAL_TABS)[number];

type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "textarea" | "select" | "boolean";
  options?: Array<{ value: string; label: string }>;
  ownerOnly?: boolean;
  tab: TabId;
  lifecycleStatus?: "Sold" | "Transferred" | "Damaged" | "OutOfService";
};

const STATUS_OPTIONS = [
  { value: "InService", label: "Active" },
  { value: "OutOfService", label: "OOS" },
  { value: "InMaintenance", label: "In Maintenance" },
  { value: "Sold", label: "Sold" },
  { value: "Transferred", label: "Transferred" },
  { value: "Damaged", label: "Damaged" },
];

const FIELD_DEFS: FieldDef[] = [
  { key: "unit_number", label: "Unit Number", type: "text", tab: "Identity" },
  { key: "vin", label: "VIN", type: "text", tab: "Identity" },
  { key: "year", label: "Year", type: "number", tab: "Identity" },
  { key: "make", label: "Make", type: "text", tab: "Identity" },
  { key: "model", label: "Model", type: "text", tab: "Identity" },
  { key: "license_plate", label: "License Plate", type: "text", tab: "Identity" },
  { key: "license_state", label: "License State", type: "text", tab: "Identity" },
  { key: "operation_country", label: "Operation Country", type: "select", tab: "Identity", options: [
    { value: "US", label: "US" }, { value: "MX", label: "MX" }, { value: "cross_border", label: "Cross Border" },
  ]},
  { key: "hazmat_endorsement", label: "Hazmat Endorsement", type: "boolean", tab: "Identity" },
  { key: "notes", label: "Notes", type: "textarea", tab: "Identity" },
  { key: "owner_company_id", label: "Owner Company ID", type: "text", tab: "Identity" },
  { key: "currently_leased_to_company_id", label: "Leased To Company ID", type: "text", tab: "Identity" },
  { key: "us_insurance_carrier", label: "US Insurance Carrier", type: "text", tab: "Insurance" },
  { key: "us_insurance_policy_number", label: "US Policy Number", type: "text", tab: "Insurance" },
  { key: "us_insurance_expiration", label: "US Insurance Expiration", type: "date", tab: "Insurance" },
  { key: "mx_insurance_carrier", label: "MX Insurance Carrier", type: "text", tab: "Insurance" },
  { key: "mx_insurance_policy_number", label: "MX Policy Number", type: "text", tab: "Insurance" },
  { key: "mx_insurance_expiration", label: "MX Insurance Expiration", type: "date", tab: "Insurance" },
  { key: "texas_irp_number", label: "Texas IRP Number", type: "text", tab: "IRP / Plates" },
  { key: "irp_account_number", label: "IRP Account Number", type: "text", tab: "IRP / Plates" },
  { key: "irp_expiration", label: "IRP Expiration", type: "date", tab: "IRP / Plates" },
  { key: "irp_registered_weight_lbs", label: "IRP Registered Weight (lbs)", type: "number", tab: "IRP / Plates" },
  { key: "sct_permit_number", label: "SCT Permit Number", type: "text", tab: "IRP / Plates" },
  { key: "sct_permit_expiration", label: "SCT Permit Expiration", type: "date", tab: "IRP / Plates" },
  { key: "pita_status", label: "PITA Status", type: "text", tab: "IRP / Plates" },
  { key: "pita_permit_number", label: "PITA Permit Number", type: "text", tab: "IRP / Plates" },
  { key: "pita_expiration", label: "PITA Expiration", type: "date", tab: "IRP / Plates" },
  { key: "ctpat_status", label: "CTPAT Status", type: "text", tab: "IRP / Plates" },
  { key: "oea_status", label: "OEA Status", type: "text", tab: "IRP / Plates" },
  { key: "acquired_date", label: "Acquired Date", type: "date", tab: "Financial" },
  { key: "disposed_date", label: "Disposed Date", type: "date", tab: "Financial" },
  { key: "title_status", label: "Title Status", type: "select", tab: "Financial", options: [
    { value: "owned", label: "Owned" }, { value: "financed", label: "Financed" }, { value: "leased", label: "Leased" },
  ]},
  { key: "lien_holder", label: "Lien Holder", type: "text", tab: "Financial" },
  { key: "qbo_vendor_id", label: "QBO Vendor ID", type: "text", tab: "Financial" },
  { key: "qbo_class_id", label: "QBO Class ID", type: "text", tab: "Financial" },
  { key: "sold_date", label: "Sale Date", type: "date", tab: "Lifecycle", lifecycleStatus: "Sold", ownerOnly: true },
  { key: "sold_price", label: "Sale Price", type: "number", tab: "Lifecycle", lifecycleStatus: "Sold", ownerOnly: true },
  { key: "sold_to", label: "Sale Buyer", type: "text", tab: "Lifecycle", lifecycleStatus: "Sold", ownerOnly: true },
  { key: "transferred_date", label: "Transfer Date", type: "date", tab: "Lifecycle", lifecycleStatus: "Transferred", ownerOnly: true },
  { key: "transferred_to_entity", label: "Transfer Recipient", type: "select", tab: "Lifecycle", lifecycleStatus: "Transferred", ownerOnly: true, options: [
    { value: "TRK", label: "TRK" }, { value: "TRANSP", label: "TRANSP" }, { value: "USMCA", label: "USMCA" },
  ]},
  { key: "damage_date", label: "Damage Date", type: "date", tab: "Lifecycle", lifecycleStatus: "Damaged" },
  { key: "damage_description", label: "Damage Description", type: "textarea", tab: "Lifecycle", lifecycleStatus: "Damaged" },
  { key: "repair_estimate", label: "Repair Estimate", type: "number", tab: "Lifecycle", lifecycleStatus: "Damaged", ownerOnly: true },
  { key: "oos_date", label: "OOS Date", type: "date", tab: "Lifecycle", lifecycleStatus: "OutOfService" },
  { key: "oos_reason", label: "OOS Reason", type: "textarea", tab: "Lifecycle", lifecycleStatus: "OutOfService" },
  { key: "oos_location", label: "OOS Location", type: "text", tab: "Lifecycle", lifecycleStatus: "OutOfService" },
  { key: "is_oos", label: "Is OOS", type: "boolean", tab: "Lifecycle", lifecycleStatus: "OutOfService" },
  { key: "status", label: "Status", type: "select", tab: "Quick-availability", options: STATUS_OPTIONS },
  { key: "quick_availability", label: "Quick Availability", type: "select", tab: "Quick-availability", options: [
    { value: "available", label: "Available" }, { value: "booked", label: "Booked" }, { value: "holding", label: "Holding" },
  ]},
  { key: "assigned_driver_id", label: "Default Driver ID", type: "text", tab: "Quick-availability" },
  { key: "status_change_reason", label: "Status Change Reason", type: "textarea", tab: "Quick-availability" },
  { key: "is_dispatch_blocked", label: "Dispatch Blocked", type: "boolean", tab: "Quick-availability" },
  { key: "dispatch_block_reason", label: "Dispatch Block Reason", type: "textarea", tab: "Quick-availability" },
];

export function hasReeferLinkage(unit: Record<string, unknown> | null | undefined, reefer: Record<string, unknown> | null | undefined): boolean {
  if (reefer && Object.keys(reefer).length > 0) return true;
  const vt = String(unit?.vehicle_type ?? "").toLowerCase();
  return vt.includes("reefer");
}

function normalizeValue(raw: unknown, type: FieldDef["type"]): string | boolean {
  if (raw == null) return type === "boolean" ? false : "";
  if (type === "boolean") return Boolean(raw);
  if (type === "date") {
    const s = String(raw);
    return s.length >= 10 ? s.slice(0, 10) : s;
  }
  return String(raw);
}

function parseFieldValue(raw: string | boolean, type: FieldDef["type"]): unknown {
  if (type === "boolean") return raw === true || raw === "true";
  if (type === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof raw !== "string" || raw.trim() === "") return null;
  return raw.trim();
}

type Props = {
  open: boolean;
  unitId: string | null;
  operatingCompanyId: string;
  rowPreview?: FleetRow | null;
  onClose: () => void;
  onSaved?: () => void;
};

export function EditVehicleModal({ open, unitId, operatingCompanyId, rowPreview, onClose, onSaved }: Props) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("Identity");
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [baseline, setBaseline] = useState<Record<string, string | boolean>>({});

  const profileQuery = useQuery({
    queryKey: ["edit-vehicle-modal", unitId, operatingCompanyId],
    queryFn: () =>
      apiRequest<{ unit: Record<string, unknown>; reefer?: Record<string, unknown> | null }>(
        `/api/v1/mdata/units/${unitId}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
      ),
    enabled: open && Boolean(unitId && operatingCompanyId),
  });

  const unit = profileQuery.data?.unit ?? null;
  const reefer = profileQuery.data?.reefer ?? null;
  const showReeferTab = hasReeferLinkage(unit, reefer);
  const currentStatus = String(draft.status ?? unit?.status ?? rowPreview?.status ?? "InService");

  // Initialize draft/baseline exactly once per open so a background refetch can never
  // reset the form and wipe the user's edits (which silently emptied dirtyCount).
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!open) initializedRef.current = false;
  }, [open]);
  useEffect(() => {
    if (!unit || initializedRef.current) return;
    const next: Record<string, string | boolean> = {};
    for (const def of FIELD_DEFS) {
      next[def.key] = normalizeValue(unit[def.key], def.type);
    }
    setBaseline(next);
    setDraft(next);
    initializedRef.current = true;
  }, [unit]);

  const visibleTabs = useMemo(
    () => EDIT_VEHICLE_MODAL_TABS.filter((tab) => tab !== "Reefer" || showReeferTab),
    [showReeferTab]
  );

  const dirtyCount = useMemo(() => {
    let count = 0;
    for (const def of FIELD_DEFS) {
      if (draft[def.key] !== baseline[def.key]) count += 1;
    }
    return count;
  }, [draft, baseline]);

  const patchPayload = useMemo(() => {
    const patch: Record<string, unknown> = {};
    for (const def of FIELD_DEFS) {
      if (draft[def.key] === baseline[def.key]) continue;
      patch[def.key] = parseFieldValue(draft[def.key], def.type);
    }
    return patch;
  }, [draft, baseline]);

  const { pushToast } = useToast();
  const saveMutation = useMutation({
    mutationFn: () => patchUnit(unitId!, patchPayload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["maintenance", "fleet-table"] });
      void queryClient.invalidateQueries({ queryKey: ["edit-vehicle-modal", unitId, operatingCompanyId] });
      onSaved?.();
      onClose();
    },
    onError: (e) => pushToast(e instanceof Error ? e.message : "Failed to save unit", "error"),
  });

  const setField = useCallback((key: string, value: string | boolean) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const renderInput = (def: FieldDef) => {
    const value = draft[def.key] ?? "";
    const inputClass = "h-8 w-full rounded border border-gray-300 px-2 text-xs";
    if (def.type === "boolean") {
      return (
        <input
          id={def.key}
          type="checkbox"
          checked={value === true}
          onChange={(e) => setField(def.key, e.target.checked)}
        />
      );
    }
    if (def.type === "textarea") {
      return (
        <textarea
          id={def.key}
          className={`${inputClass} min-h-[4rem] py-1`}
          value={String(value)}
          onChange={(e) => setField(def.key, e.target.value)}
        />
      );
    }
    if (def.type === "select" && def.options) {
      return (
        <select id={def.key} className={inputClass} value={String(value)} onChange={(e) => setField(def.key, e.target.value)}>
          <option value="">—</option>
          {def.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }
    return (
      <input
        id={def.key}
        type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
        className={inputClass}
        value={String(value)}
        onChange={(e) => setField(def.key, e.target.value)}
      />
    );
  };

  const fieldsForTab = (tab: TabId) => {
    if (tab === "Reefer") return [];
    if (tab === "Documents") return [];
    if (tab === "Lifecycle") {
      return FIELD_DEFS.filter((def) => {
        if (def.tab !== "Lifecycle") return false;
        if (!def.lifecycleStatus) return true;
        if (def.lifecycleStatus === "OutOfService") return currentStatus === "OutOfService";
        return def.lifecycleStatus === currentStatus;
      });
    }
    return FIELD_DEFS.filter((def) => def.tab === tab);
  };

  const unitLabel = String(unit?.unit_number ?? rowPreview?.unit_number ?? unitId ?? "Unit");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit Vehicle · ${unitLabel}`}
      confirmDiscardOnClose
      isDirty={dirtyCount > 0}
      modalKind="edit-vehicle"
      sizePreset="lg"
    >
      <div className="flex min-h-[24rem] flex-col gap-3">
        <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2">
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`rounded px-2 py-1 text-[11px] font-medium ${
                activeTab === tab ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {profileQuery.isLoading ? <p className="text-xs text-gray-600">Loading unit…</p> : null}
        {profileQuery.isError ? <p className="text-xs text-red-600">Failed to load unit profile.</p> : null}

        {activeTab === "Reefer" ? (
          <FieldSet title="Reefer (linked trailer)" columns={1}>
            <p className="text-xs text-gray-600">
              {reefer
                ? `Reefer data is maintained on linked trailer ${String(reefer.trailer_id ?? reefer.id ?? "—")}. Open trailer profile to edit reefer settings.`
                : "No reefer attached."}
            </p>
          </FieldSet>
        ) : null}

        {activeTab === "Documents" ? (
          <FieldSet title="Documents & Photos" columns={1}>
            <p className="text-xs text-gray-600">
              Photo grid and document list are available on the full vehicle profile page.
            </p>
          </FieldSet>
        ) : null}

        {activeTab !== "Reefer" && activeTab !== "Documents" ? (
          <FieldSet title={activeTab} columns={2}>
            {fieldsForTab(activeTab).map((def) => (
              <FormField
                key={def.key}
                name={def.key}
                label={def.label}
                dirty={draft[def.key] !== baseline[def.key]}
                ownerOnly={def.ownerOnly}
              >
                {renderInput(def)}
              </FormField>
            ))}
          </FieldSet>
        ) : null}

        <div className="mt-auto flex justify-end gap-2 border-t border-gray-200 pt-3">
          <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
          <Button
            variant="primary"
            type="button"
            disabled={saveMutation.isPending || !unitId}
            onClick={() => {
              if (Object.keys(patchPayload).length === 0) {
                onClose();
                return;
              }
              saveMutation.mutate();
            }}
          >
            Save Changes ({dirtyCount} fields modified)
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export const EDIT_VEHICLE_MODAL_FIELD_COUNT = FIELD_DEFS.length;
