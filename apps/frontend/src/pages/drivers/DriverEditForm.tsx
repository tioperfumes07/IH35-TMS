/**
 * DRV-F421 — driver edit form on /drivers/:id?tab=edit
 * (preview screen 2 / canvas board 6). 12 groups + Notes, 3 across, 34px controls.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Combobox } from "../../components/Combobox";
import { DatePicker } from "../../components/forms/DatePicker";
import { DriverSamsaraDuplicateBanner } from "../../components/driver-profile/DriverSamsaraDuplicateBanner";
import { DriverPaymentMethodsCard } from "../../components/driver-profile/DriverPaymentMethodsCard";
import { W8BenSection } from "../../components/driver-profile/W8BenSection";
import { ApiError } from "../../api/client";
import { getDriver, updateDriver, listDriverQualifications, createDriverQualification, deactivateDriverQualification, reactivateQualification } from "../../api/mdata";
import { listEquipmentTypes } from "../../api/catalogs";
import { getDriverProfileSamsara } from "../../api/driver-profile-tabs";
import { driverProfileTabHref } from "./driverProfileTabs";
import type { Driver, UpdateDriverInput } from "../../types/api";

const CTRL = "de-ctrl h-[34px] rounded-sm border border-[#D8E0E8] bg-white px-2 text-[12px] text-[#0F1B2D] focus:outline focus:outline-2 focus:outline-[#14314F]";

function clipClass(filled: boolean) {
  return `inline-flex h-[34px] w-[34px] items-center justify-center rounded-sm border text-[12px] ${
    filled ? "border-[#14314F] bg-[#14314F] text-white" : "border-[#D8E0E8] bg-[var(--surface-unselected)] text-[#64748B]"
  }`;
}

const VISA_TYPES = ["B1", "B2", "TN", "H-2A", "H-2B", "L1", "Permanent resident", "US citizen", "Other"];
const B1_STATUS = ["Valid", "Expiring", "Expired", "Not applicable", "Active", "Pending"];
const CDL_CLASSES = ["A", "B", "C"];
const PAY_BASIS = ["short_miles", "practical_miles"];
const PREFERRED = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
];
const DRIVER_STATUS = ["Active", "Probation", "On leave", "Inactive", "Terminated"];

const CHIP_ALIASES: Record<string, string[]> = {
  "Dry Van": ["dry van", "dryvan", "van"],
  Reefer: ["reefer", "refrigerated"],
  Flatbed: ["flatbed", "flat bed"],
  Lowboy: ["lowboy", "low boy"],
  "Power-only": ["power-only", "power only", "poweronly", "power"],
};

function Field({
  label,
  width,
  error,
  children,
}: {
  label: string;
  width: "wd" | "wm" | "wc" | "ws" | "wmd" | "wl" | "wide";
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-[#475569]">
      {label}
      <span className={`block ${width}`}>{children}</span>
      {error ? <span className="text-[11px] font-medium normal-case text-red-700">{error}</span> : null}
    </label>
  );
}

function Clip({ name, filled }: { name: string; filled: boolean }) {
  return (
    <label className={clipClass(filled)} title={`Attach ${name} scan`}>
      <input type="file" className="sr-only" accept="image/*,.pdf" aria-label={`Clip for ${name}`} />
      <span aria-hidden="true">📎</span>
    </label>
  );
}

function Group({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`rounded-sm border border-[#D8E0E8] bg-white p-3 ${wide ? "md:col-span-3" : ""}`} data-testid={`driver-edit-group-${title}`}>
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[#475569]">{title}</h2>
      <div className={wide ? "grid gap-3" : "grid grid-cols-1 gap-3 sm:grid-cols-2"}>{children}</div>
    </section>
  );
}

function str(v: unknown): string {
  return typeof v === "string" && v ? v : "";
}

function dateInput(v: unknown): string {
  const s = str(v);
  return s.length >= 10 ? s.slice(0, 10) : "";
}

function fieldErrorsFromApi(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !err.data || typeof err.data !== "object") return {};
  const data = err.data as Record<string, unknown>;
  const raw = (data.fieldErrors ?? (data.details && typeof data.details === "object" ? (data.details as Record<string, unknown>).fieldErrors : null)) as
    | Record<string, unknown>
    | null
    | undefined;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const first = Array.isArray(v) ? v[0] : v;
    if (typeof first === "string" && first.trim()) out[k] = first.trim();
  }
  return out;
}

export function DriverEditForm({
  driverId,
  operatingCompanyId,
}: {
  driverId: string;
  operatingCompanyId: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [bankConfirm, setBankConfirm] = useState(false);
  const [bankDraft, setBankDraft] = useState({ account: "", routing: "" });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const driverQ = useQuery({
    queryKey: ["driver-edit", driverId, operatingCompanyId],
    queryFn: () => getDriver(driverId, operatingCompanyId),
    enabled: Boolean(driverId && operatingCompanyId),
  });
  const qualsQ = useQuery({
    queryKey: ["driver-quals", driverId, operatingCompanyId],
    queryFn: () => listDriverQualifications(driverId, operatingCompanyId, true),
    enabled: Boolean(driverId && operatingCompanyId),
  });
  const typesQ = useQuery({
    queryKey: ["equipment-types", operatingCompanyId],
    queryFn: () => listEquipmentTypes(operatingCompanyId, true),
    enabled: Boolean(operatingCompanyId),
  });
  const samsaraQ = useQuery({
    queryKey: ["driver-samsara", driverId, operatingCompanyId],
    queryFn: () => getDriverProfileSamsara(operatingCompanyId, driverId),
    enabled: Boolean(driverId && operatingCompanyId),
  });

  const driver = driverQ.data;
  useEffect(() => {
    if (!driver) return;
    setForm({
      first_name: str(driver.first_name),
      last_name: str(driver.last_name),
      date_of_birth: dateInput(driver.date_of_birth),
      hire_date: dateInput(driver.hire_date),
      status: str(driver.status),
      preferred_language: str(driver.preferred_language) || "en",
      phone: str(driver.phone),
      email: str(driver.email),
      emergency_contact_name: str(driver.emergency_contact_name),
      emergency_contact_relationship: str(driver.emergency_contact_relationship),
      emergency_contact_phone_primary: str(driver.emergency_contact_phone_primary),
      emergency_contact_phone_alternate: str(driver.emergency_contact_phone_alternate),
      emergency_contact_address: str(driver.emergency_contact_address),
      emergency_contact_notes: str(driver.emergency_contact_notes),
      cdl_number: str(driver.cdl_number),
      cdl_state: str(driver.cdl_state),
      cdl_class: str(driver.cdl_class),
      cdl_expires_at: dateInput(driver.cdl_expires_at),
      mexican_license_number: str(driver.mexican_license_number),
      mexican_license_expiration: dateInput(driver.mexican_license_expiration),
      dot_medical_expires_at: dateInput(driver.dot_medical_expires_at),
      hazmat_endorsement_expires_at: dateInput(driver.hazmat_endorsement_expires_at),
      twic_card_number: str(driver.twic_card_number),
      twic_expiration: dateInput(driver.twic_expiration),
      fast_card_number: str(driver.fast_card_number),
      fast_card_expiration: dateInput(driver.fast_card_expiration),
      visa_type: str(driver.visa_type) || (driver.has_b1_visa ? "B1" : ""),
      visa_number: str(driver.visa_number) || str(driver.b1_visa_number),
      visa_expires_at: dateInput(driver.visa_expires_at) || dateInput(driver.b1_visa_expires_date),
      visa_b1_status: str(driver.visa_b1_status) || (driver.has_b1_visa ? "Valid" : ""),
      curp: str(driver.curp),
      ine_number: str(driver.ine_number),
      passport_number: str(driver.passport_number),
      passport_expires_at: dateInput(driver.passport_expires_at),
      passport_country: str(driver.passport_country),
      pay_basis: str(driver.pay_basis),
      notes: str(driver.notes),
    });
  }, [driver]);

  const set = (key: string, value: string) => {
    setForm((cur) => ({ ...cur, [key]: value }));
    setFieldErrors((cur) => {
      if (!cur[key]) return cur;
      const next = { ...cur };
      delete next[key];
      return next;
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      const body: UpdateDriverInput = {
        first_name: form.first_name,
        last_name: form.last_name,
        date_of_birth: form.date_of_birth || null,
        hire_date: form.hire_date || null,
        status: form.status as Driver["status"],
        phone: form.phone,
        email: form.email || null,
        preferred_language: form.preferred_language as Driver["preferred_language"],
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_relationship: form.emergency_contact_relationship || null,
        emergency_contact_phone_primary: form.emergency_contact_phone_primary || null,
        emergency_contact_phone_alternate: form.emergency_contact_phone_alternate || null,
        emergency_contact_address: form.emergency_contact_address || null,
        emergency_contact_notes: form.emergency_contact_notes || null,
        cdl_number: form.cdl_number || null,
        cdl_state: form.cdl_state || null,
        cdl_class: (form.cdl_class || null) as Driver["cdl_class"],
        cdl_expires_at: form.cdl_expires_at || null,
        mexican_license_number: form.mexican_license_number || null,
        mexican_license_expiration: form.mexican_license_expiration || null,
        dot_medical_expires_at: form.dot_medical_expires_at || null,
        hazmat_endorsement_expires_at: form.hazmat_endorsement_expires_at || null,
        twic_card_number: form.twic_card_number || null,
        twic_expiration: form.twic_expiration || null,
        fast_card_number: form.fast_card_number || null,
        fast_card_expiration: form.fast_card_expiration || null,
        visa_type: form.visa_type || null,
        visa_number: form.visa_number || null,
        visa_expires_at: form.visa_expires_at || null,
        visa_b1_status: form.visa_b1_status || null,
        curp: form.curp || null,
        ine_number: form.ine_number || null,
        passport_number: form.passport_number || null,
        passport_expires_at: form.passport_expires_at || null,
        passport_country: form.passport_country || null,
        pay_basis: form.pay_basis as Driver["pay_basis"],
        notes: form.notes || null,
      };
      return updateDriver(driverId, body);
    },
    onSuccess: async () => {
      setFieldErrors({});
      setError(null);
      await qc.invalidateQueries({ queryKey: ["driver-edit", driverId] });
      await qc.invalidateQueries({ queryKey: ["driver-overview", operatingCompanyId, driverId] });
      navigate(driverProfileTabHref(driverId, "Overview"));
    },
    onError: (err: Error) => {
      const fields = fieldErrorsFromApi(err);
      setFieldErrors(fields);
      setError(err.message || "Could not save this driver.");
    },
  });

  const cancel = () => navigate(driverProfileTabHref(driverId, "Overview"));

  const types = typesQ.data?.equipment_types ?? [];
  const quals = qualsQ.data?.qualifications ?? [];
  const chipTypes = useMemo(() => {
    const picked: Array<{ label: string; type: (typeof types)[number] | null }> = [];
    for (const label of Object.keys(CHIP_ALIASES)) {
      const aliases = CHIP_ALIASES[label];
      const type = types.find((t) => aliases.some((a) => `${t.name} ${t.code}`.toLowerCase().includes(a))) ?? null;
      picked.push({ label, type });
    }
    for (const t of types) {
      if (picked.some((p) => p.type?.id === t.id)) continue;
      picked.push({ label: t.name, type: t });
    }
    return picked;
  }, [types]);

  const toggleQual = async (equipmentTypeId: string, activeQualId: string | null, inactiveQualId: string | null) => {
    if (activeQualId) {
      await deactivateDriverQualification(driverId, activeQualId, operatingCompanyId);
    } else if (inactiveQualId) {
      await reactivateQualification(driverId, inactiveQualId, operatingCompanyId);
    } else {
      await createDriverQualification(driverId, { equipment_type_id: equipmentTypeId }, operatingCompanyId);
    }
    await qc.invalidateQueries({ queryKey: ["driver-quals", driverId] });
  };

  const accounts = samsaraQ.data?.samsara_accounts ?? [];

  if (driverQ.isError) {
    return <p className="p-3 text-[12px] text-red-700">Could not load this driver for edit.</p>;
  }
  if (!driver) {
    return <p className="p-3 text-[12px] text-[#64748B]">Loading edit form…</p>;
  }

  return (
    <form
      className="space-y-3"
      data-testid="driver-edit-form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[#64748B]">One screen. Enter saves. Esc cancels.</p>
        <div className="flex gap-2">
          <button type="button" className={`${CTRL} ws`} onClick={cancel} data-testid="driver-edit-cancel">
            Cancel
          </button>
          <button type="submit" className={`${CTRL} ws bg-[#14314F] text-white`} disabled={save.isPending} data-testid="driver-edit-save">
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {error ? <p role="alert" className="text-[12px] text-red-700">{error}</p> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Group title="Identity">
          <Field label="First name" width="wmd">
            <input className={`${CTRL} wmd`} value={form.first_name ?? ""} onChange={(e) => set("first_name", e.target.value)} />
          </Field>
          <Field label="Last name" width="wmd">
            <input className={`${CTRL} wmd`} value={form.last_name ?? ""} onChange={(e) => set("last_name", e.target.value)} />
          </Field>
          <Field label="Date of birth" width="wd" error={fieldErrors.date_of_birth}>
            <DatePicker id="driver-edit-date-of-birth" box="filter" className="wd" value={form.date_of_birth ?? ""} onChange={(v) => set("date_of_birth", v)} />
          </Field>
          <Field label="Hire date" width="wd">
            <DatePicker id="driver-edit-hire-date" box="filter" className="wd" value={form.hire_date ?? ""} onChange={(v) => set("hire_date", v)} />
          </Field>
          <Field label="Status" width="ws">
            <Combobox className={`${CTRL} ws`} options={DRIVER_STATUS.map((v) => ({ value: v, label: v }))} value={form.status || null} onChange={(v) => set("status", v ?? "Active")} />
          </Field>
          <Field label="Language" width="ws">
            <Combobox
              className={`${CTRL} ws`}
              options={PREFERRED}
              value={form.preferred_language || null}
              onChange={(v) => set("preferred_language", v ?? "en")}
              dataTestId="driver-edit-language"
            />
          </Field>
        </Group>

        <Group title="Contact">
          <Field label="Phone" width="ws" error={fieldErrors.phone}>
            <input className={`${CTRL} ws`} value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Email" width="wl" error={fieldErrors.email}>
            <input type="email" className={`${CTRL} wl`} value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </Field>
        </Group>

        <Group title="Emergency contact">
          <Field label="Name" width="wmd">
            <input className={`${CTRL} wmd`} value={form.emergency_contact_name ?? ""} onChange={(e) => set("emergency_contact_name", e.target.value)} />
          </Field>
          <Field label="Relationship" width="ws">
            <input className={`${CTRL} ws`} value={form.emergency_contact_relationship ?? ""} onChange={(e) => set("emergency_contact_relationship", e.target.value)} />
          </Field>
          <Field label="Phone" width="ws">
            <input className={`${CTRL} ws`} value={form.emergency_contact_phone_primary ?? ""} onChange={(e) => set("emergency_contact_phone_primary", e.target.value)} />
          </Field>
          <Field label="Alternate" width="ws">
            <input className={`${CTRL} ws`} value={form.emergency_contact_phone_alternate ?? ""} onChange={(e) => set("emergency_contact_phone_alternate", e.target.value)} />
          </Field>
          <Field label="Address" width="wl">
            <input className={`${CTRL} wl`} value={form.emergency_contact_address ?? ""} onChange={(e) => set("emergency_contact_address", e.target.value)} />
          </Field>
          <Field label="Notes" width="wide">
            <textarea className="wide min-h-[68px] rounded-sm border border-[#D8E0E8] px-2 py-1 text-[12px] focus:outline focus:outline-2 focus:outline-[#14314F]" value={form.emergency_contact_notes ?? ""} onChange={(e) => set("emergency_contact_notes", e.target.value)} />
          </Field>
        </Group>

        <Group title="Licence">
          <div className="flex items-end gap-2">
            <Field label="CDL number" width="wc">
              <input className={`${CTRL} wc`} value={form.cdl_number ?? ""} onChange={(e) => set("cdl_number", e.target.value)} />
            </Field>
            <Clip name="CDL" filled={Boolean(form.cdl_number)} />
          </div>
          <Field label="State" width="wc">
            <input className={`${CTRL} wc`} value={form.cdl_state ?? ""} onChange={(e) => set("cdl_state", e.target.value)} maxLength={2} />
          </Field>
          <Field label="Class" width="wc">
            <Combobox className={`${CTRL} wc`} options={CDL_CLASSES.map((c) => ({ value: c, label: c }))} value={form.cdl_class || null} onChange={(v) => set("cdl_class", v ?? "")} />
          </Field>
          <Field label="CDL expires" width="wd">
            <DatePicker id="driver-edit-cdl-expires" box="filter" className="wd" value={form.cdl_expires_at ?? ""} onChange={(v) => set("cdl_expires_at", v)} />
          </Field>
          <div className="flex items-end gap-2">
            <Field label="Mexican licence" width="wc">
              <input className={`${CTRL} wc`} value={form.mexican_license_number ?? ""} onChange={(e) => set("mexican_license_number", e.target.value)} />
            </Field>
            <Clip name="Mexican licence" filled={Boolean(form.mexican_license_number)} />
          </div>
          <Field label="Mexican licence expires" width="wd">
            <DatePicker id="driver-edit-mexican-licence-expires" box="filter" className="wd" value={form.mexican_license_expiration ?? ""} onChange={(v) => set("mexican_license_expiration", v)} />
          </Field>
        </Group>

        <Group title="Medical & credentials">
          <div className="flex items-end gap-2">
            <Field label="Medical card expires" width="wd">
              <DatePicker id="driver-edit-medical-card-expires" box="filter" className="wd" value={form.dot_medical_expires_at ?? ""} onChange={(v) => set("dot_medical_expires_at", v)} />
            </Field>
            <Clip name="medical card" filled={Boolean(form.dot_medical_expires_at)} />
          </div>
          <div className="flex items-end gap-2">
            <Field label="Hazmat expires" width="wd">
              <DatePicker id="driver-edit-hazmat-expires" box="filter" className="wd" value={form.hazmat_endorsement_expires_at ?? ""} onChange={(v) => set("hazmat_endorsement_expires_at", v)} />
            </Field>
            <Clip name="hazmat" filled={Boolean(form.hazmat_endorsement_expires_at)} />
          </div>
          <div className="flex items-end gap-2">
            <Field label="TWIC number" width="wc">
              <input className={`${CTRL} wc`} value={form.twic_card_number ?? ""} onChange={(e) => set("twic_card_number", e.target.value)} />
            </Field>
            <Clip name="TWIC" filled={Boolean(form.twic_card_number)} />
          </div>
          <Field label="TWIC expires" width="wd">
            <DatePicker id="driver-edit-twic-expires" box="filter" className="wd" value={form.twic_expiration ?? ""} onChange={(v) => set("twic_expiration", v)} />
          </Field>
          <div className="flex items-end gap-2">
            <Field label="FAST card" width="wc">
              <input className={`${CTRL} wc`} value={form.fast_card_number ?? ""} onChange={(e) => set("fast_card_number", e.target.value)} />
            </Field>
            <Clip name="FAST" filled={Boolean(form.fast_card_number)} />
          </div>
          <Field label="FAST expires" width="wd">
            <DatePicker id="driver-edit-fast-card-expires" box="filter" className="wd" value={form.fast_card_expiration ?? ""} onChange={(v) => set("fast_card_expiration", v)} />
          </Field>
        </Group>

        <Group title="Work authorisation">
          <div className="flex items-end gap-2">
            <Field label="Visa type" width="ws">
              <Combobox
                className={`${CTRL} ws`}
                options={VISA_TYPES.map((v) => ({ value: v, label: v }))}
                value={form.visa_type || null}
                onChange={(v) => set("visa_type", v ?? "")}
                dataTestId="driver-edit-visa-type"
              />
            </Field>
            <Clip name="visa" filled={Boolean(form.visa_number)} />
          </div>
          <Field label="Visa number" width="wc">
            <input className={`${CTRL} wc`} value={form.visa_number ?? ""} onChange={(e) => set("visa_number", e.target.value)} />
          </Field>
          <Field label="Visa expires" width="wd">
            <DatePicker id="driver-edit-visa-expires" box="filter" className="wd" value={form.visa_expires_at ?? ""} onChange={(v) => set("visa_expires_at", v)} />
          </Field>
          <Field label="B1 status" width="ws">
            <Combobox
              className={`${CTRL} ws`}
              options={B1_STATUS.map((v) => ({ value: v, label: v }))}
              value={form.visa_b1_status || null}
              onChange={(v) => set("visa_b1_status", v ?? "")}
              dataTestId="driver-edit-b1-status"
            />
          </Field>
        </Group>

        <Group title="Mexico documents">
          <div className="flex items-end gap-2">
            <Field label="CURP" width="wmd" error={fieldErrors.curp}>
              <input
                className={`${CTRL} wmd`}
                value={form.curp ?? ""}
                onChange={(e) => set("curp", e.target.value.toUpperCase())}
                maxLength={18}
                data-testid="driver-edit-curp"
              />
            </Field>
            <Clip name="CURP" filled={Boolean(form.curp)} />
          </div>
          <div className="flex items-end gap-2">
            <Field label="INE number" width="ws" error={fieldErrors.ine_number}>
              <input
                className={`${CTRL} ws`}
                value={form.ine_number ?? ""}
                onChange={(e) => set("ine_number", e.target.value)}
                data-testid="driver-edit-ine"
              />
            </Field>
            <Clip name="INE" filled={Boolean(form.ine_number)} />
          </div>
          <div className="flex items-end gap-2">
            <Field label="Passport number" width="ws">
              <input className={`${CTRL} ws`} value={form.passport_number ?? ""} onChange={(e) => set("passport_number", e.target.value)} />
            </Field>
            <Clip name="passport" filled={Boolean(form.passport_number)} />
          </div>
          <Field label="Passport expires" width="wd">
            <DatePicker id="driver-edit-passport-expires" box="filter" className="wd" value={form.passport_expires_at ?? ""} onChange={(v) => set("passport_expires_at", v)} />
          </Field>
        </Group>

        <Group title="Equipment he runs" wide>
          <p className="text-[12px] text-[#64748B]">Unticking deactivates the qualification. It is never deleted.</p>
          <div className="flex flex-wrap gap-2" data-testid="driver-edit-equipment-chips">
            {chipTypes.map((chip) => {
              if (!chip.type) {
                return (
                  <span key={chip.label} className="rounded-sm border border-dashed border-[#D8E0E8] px-2 py-1 text-[12px] text-[#64748B]">
                    {chip.label}
                  </span>
                );
              }
              const active = quals.find((q) => q.equipment_type_id === chip.type!.id && q.is_active);
              const inactive = quals.find((q) => q.equipment_type_id === chip.type!.id && !q.is_active);
              const on = Boolean(active);
              return (
                <label key={chip.type.id} className={`inline-flex h-[34px] items-center gap-2 rounded-sm border px-2 text-[12px] ${on ? "border-[#14314F] bg-[var(--ih-page)]" : "border-[#D8E0E8]"}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => void toggleQual(chip.type!.id, active?.id ?? null, inactive?.id ?? null)}
                  />
                  <span>{chip.label}</span>
                  <span className="tabular-nums text-[#64748B]">{active ? dateInput(active.qualified_at) || "—" : inactive ? "inactive" : ""}</span>
                </label>
              );
            })}
          </div>
        </Group>

        <Group title="Tax">
          <p className="text-[12px] text-[#64748B]">W-9 / W-8BEN / W-8BEN-E live on the tax certificate. Capture signed date, ID type and tax ID there — not invented on the driver row.</p>
          <W8BenSection
            w8ben={{ status: "missing", on_file: false }}
            unavailable={false}
            onCapture={() => navigate(`/drivers/${driverId}?tab=documents`)}
          />
        </Group>

        <Group title="Pay">
          <Field label="Pay basis" width="ws">
            <Combobox
              className={`${CTRL} ws`}
              options={PAY_BASIS.map((v) => ({ value: v, label: v }))}
              value={form.pay_basis || null}
              onChange={(v) => set("pay_basis", v ?? "")}
            />
          </Field>
        </Group>

        <Group title="Payment method">
          <p className="text-[12px] text-[#64748B]">Banking is masked. Changing it is an audited event and needs a second approval.</p>
          <Field label="Account (masked)" width="wm">
            <input className={`${CTRL} wm text-right`} value={bankConfirm ? bankDraft.account : "•••• 1234"} readOnly={!bankConfirm} onChange={(e) => setBankDraft((c) => ({ ...c, account: e.target.value }))} />
          </Field>
          <Field label="Routing (masked)" width="wm">
            <input className={`${CTRL} wm text-right`} value={bankConfirm ? bankDraft.routing : "•••• 0000"} readOnly={!bankConfirm} onChange={(e) => setBankDraft((c) => ({ ...c, routing: e.target.value }))} />
          </Field>
          <label className="flex items-center gap-2 text-[12px] text-[#0F1B2D]">
            <input type="checkbox" checked={bankConfirm} onChange={(e) => setBankConfirm(e.target.checked)} />
            I have a second approval to change banking
          </label>
          <DriverPaymentMethodsCard driverId={driverId} companyId={operatingCompanyId} />
        </Group>

        <Group title="Assignment">
          <p className="text-[12px] text-[#64748B]">Many Samsara users can map to this one driver.</p>
          {accounts.length === 0 ? <p className="text-[12px] text-[#64748B]">No Samsara users mapped.</p> : (
            <ul className="text-[12px]" data-testid="driver-edit-samsara-list">
              {accounts.map((a) => (
                <li key={a.samsara_driver_id} data-samsara-driver-id={a.samsara_driver_id}>
                  {a.samsara_username?.trim() ? a.samsara_username : "—"}
                  {a.is_active === false ? " · inactive" : ""}
                </li>
              ))}
            </ul>
          )}
          <Link
            className={`${CTRL} wmd inline-flex items-center justify-center`}
            to={`/integrations/samsara/drivers?driver_id=${encodeURIComponent(driverId)}`}
            data-testid="driver-edit-map-samsara"
          >
            Map Samsara users
          </Link>
          <DriverSamsaraDuplicateBanner companyId={operatingCompanyId} driverId={driverId} />
        </Group>

        <Group title="Notes" wide>
          <Field label="Notes" width="wide">
            <textarea
              className="wide min-h-[88px] w-full rounded-sm border border-[#D8E0E8] px-2 py-1 text-[12px] focus:outline focus:outline-2 focus:outline-[#14314F]"
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </Group>
      </div>
    </form>
  );
}
