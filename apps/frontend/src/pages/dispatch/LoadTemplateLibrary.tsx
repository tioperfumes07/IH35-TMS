import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { UseFormSetValue } from "react-hook-form";
import { listLoadTemplates, createLoadTemplate, type LoadTemplateRow } from "../../api/dispatch";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { useStagedListFilters } from "../../components/table";
import { useSearchParams } from "react-router-dom";
import { ListErrorState } from "../../components/ListErrorState";

const EMPTY_FILTERS = {
  customerId: "",
};

type BookStop = {
  stop_type: "pickup" | "delivery";
  sequence_number: number;
  city: string;
  state: string;
  country: string;
  address_line1: string;
  // RATECON-4 — ZIP is now a first-class stop field (was silently dropped by this normalizer, forcing the
  // rate-con mapper to bury it in stop_notes). Optional so existing template JSON without it still applies.
  zip?: string;
  pickup_number?: string;
  po_number?: string;
  scheduled_arrival_at: string;
  time_window_type?: "appointment" | "open_window" | "select_hours" | "refused";
  appointment_start_at?: string;
  appointment_end_at?: string;
  lumper_required?: boolean;
  lumper_paid_by?: "carrier" | "shipper" | "broker" | "receiver" | "unknown";
  lumper_amount_cents?: number;
  is_tarp_stop?: boolean;
  tarp_count?: number;
  stop_notes?: string;
  site_contact_name?: string;
  site_contact_phone?: string;
  gate_dock_text?: string;
};

export type MinimalBookForm = {
  customer_id: string;
  customer_name: string;
  linehaul_cents: number;
  fuel_surcharge_cents: number;
  accessorial_cents: number;
  miles_practical: number;
  miles_shortest: number;
  miles_deadhead: number;
  notes: string;
  is_sample_data: boolean;
  stops: BookStop[];
};

export function templateJsonFromLoadDetail(load: {
  customer_id: string;
  customer_name?: string | null;
  rate_total_cents: number;
  notes: string | null;
  stops: Array<{
    stop_type: string;
    sequence_number: number;
    city: string | null;
    state: string | null;
    country: string | null;
    address_line1: string | null;
    scheduled_arrival_at: string | null;
    appointment_start_at?: string | null;
    appointment_end_at?: string | null;
    notes?: string | null;
  }>;
}): Record<string, unknown> {
  const stops = load.stops.map((s, idx) => ({
    stop_type: s.stop_type,
    sequence_number: s.sequence_number ?? idx + 1,
    city: s.city ?? "",
    state: s.state ?? "",
    country: s.country ?? "USA",
    address_line1: s.address_line1 ?? "",
    scheduled_arrival_at: s.scheduled_arrival_at ?? "",
    appointment_start_at: s.appointment_start_at ?? "",
    appointment_end_at: s.appointment_end_at ?? "",
    stop_notes: s.notes ?? "",
  }));
  return {
    customer_id: load.customer_id,
    customer_name: load.customer_name ?? "",
    linehaul_cents: load.rate_total_cents,
    miles_shortest: 0,
    miles_practical: 0,
    miles_deadhead: 0,
    notes: load.notes ?? "",
    is_sample_data: Boolean((load as { is_sample_data?: boolean | null }).is_sample_data),
    stops,
  };
}

function normalizeTemplateStops(raw: unknown): BookStop[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [
      {
        stop_type: "pickup",
        sequence_number: 1,
        city: "",
        state: "",
        country: "USA",
        address_line1: "",
        scheduled_arrival_at: "",
        time_window_type: "appointment",
        appointment_start_at: "",
        appointment_end_at: "",
        lumper_required: false,
        lumper_paid_by: "unknown",
        lumper_amount_cents: 0,
        stop_notes: "",
        is_tarp_stop: false,
        tarp_count: 0,
        site_contact_name: "",
        site_contact_phone: "",
        gate_dock_text: "",
      },
      {
        stop_type: "delivery",
        sequence_number: 2,
        city: "",
        state: "",
        country: "USA",
        address_line1: "",
        scheduled_arrival_at: "",
        time_window_type: "appointment",
        appointment_start_at: "",
        appointment_end_at: "",
        lumper_required: false,
        lumper_paid_by: "unknown",
        lumper_amount_cents: 0,
        stop_notes: "",
        is_tarp_stop: false,
        tarp_count: 0,
        site_contact_name: "",
        site_contact_phone: "",
        gate_dock_text: "",
      },
    ];
  }
  return raw.map((item, idx) => {
    const o = item as Record<string, unknown>;
    const t = String(o.stop_type ?? "");
    let stop_type: "pickup" | "delivery" = t === "pickup" ? "pickup" : "delivery";
    if (t === "fuel" || t === "rest" || t === "border") stop_type = idx === 0 ? "pickup" : "delivery";
    return {
      stop_type,
      sequence_number: idx + 1,
      city: String(o.city ?? ""),
      state: String(o.state ?? ""),
      country: String(o.country ?? "USA"),
      address_line1: String(o.address_line1 ?? o.location_address ?? ""),
      zip: String(o.zip ?? o.postal_code ?? ""),
      pickup_number: String(o.pickup_number ?? ""),
      po_number: String(o.po_number ?? ""),
      scheduled_arrival_at: String(o.scheduled_arrival_at ?? "").slice(0, 16),
      time_window_type: (o.time_window_type as BookStop["time_window_type"]) ?? "appointment",
      appointment_start_at: o.appointment_start_at ? String(o.appointment_start_at).slice(0, 16) : "",
      appointment_end_at: o.appointment_end_at ? String(o.appointment_end_at).slice(0, 16) : "",
      lumper_required: Boolean(o.lumper_required),
      lumper_paid_by: (o.lumper_paid_by as BookStop["lumper_paid_by"]) ?? "unknown",
      lumper_amount_cents: Number(o.lumper_amount_cents ?? 0),
      is_tarp_stop: Boolean(o.is_tarp_stop),
      tarp_count: Number(o.tarp_count ?? 0),
      stop_notes: String(o.stop_notes ?? o.notes ?? ""),
      site_contact_name: String(o.site_contact_name ?? ""),
      site_contact_phone: String(o.site_contact_phone ?? ""),
      gate_dock_text: String(o.gate_dock_text ?? ""),
    };
  });
}

export function applyLoadTemplateToBookForm(setValue: UseFormSetValue<MinimalBookForm>, json: Record<string, unknown>) {
  if (typeof json.customer_id === "string") setValue("customer_id", json.customer_id, { shouldDirty: true });
  if (typeof json.customer_name === "string") setValue("customer_name", json.customer_name, { shouldDirty: true });
  if (typeof json.linehaul_cents === "number") setValue("linehaul_cents", json.linehaul_cents, { shouldDirty: true });
  if (typeof json.fuel_surcharge_cents === "number") setValue("fuel_surcharge_cents", json.fuel_surcharge_cents, { shouldDirty: true });
  if (typeof json.accessorial_cents === "number") setValue("accessorial_cents", json.accessorial_cents, { shouldDirty: true });
  if (typeof json.miles_practical === "number") setValue("miles_practical", json.miles_practical, { shouldDirty: true });
  if (typeof json.miles_shortest === "number") setValue("miles_shortest", json.miles_shortest, { shouldDirty: true });
  if (typeof json.miles_deadhead === "number") setValue("miles_deadhead", json.miles_deadhead, { shouldDirty: true });
  if (typeof json.notes === "string") setValue("notes", json.notes, { shouldDirty: true });
  if (typeof json.is_sample_data === "boolean") setValue("is_sample_data", json.is_sample_data, { shouldDirty: true });
  const stops = normalizeTemplateStops(json.stops);
  setValue("stops", stops, { shouldDirty: true });
}

type PickerProps = {
  operatingCompanyId: string;
  onSelectTemplate: (row: LoadTemplateRow) => void;
};

/** Dropdown row for Book Load modal */
export function LoadTemplatePicker({ operatingCompanyId, onSelectTemplate }: PickerProps) {
  const q = useQuery({
    queryKey: ["load-templates", operatingCompanyId],
    queryFn: () => listLoadTemplates(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });
  const templates: LoadTemplateRow[] = q.data?.templates ?? [];

  return (
    <label className="flex flex-col text-[10px] font-semibold text-gray-700">
      Load from template
      <SelectCombobox
        className="mt-0.5 font-normal"
        defaultValue=""
        disabled={q.isLoading || q.isError || templates.length === 0}
        onChange={(e) => {
          const id = e.target.value;
          const row = templates.find((t) => t.id === id);
          if (row) onSelectTemplate(row);
          e.target.value = "";
        }}
      >
        <option value="">{q.isError ? "Templates unavailable" : templates.length === 0 ? "No templates yet" : "Choose template…"}</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </SelectCombobox>
      {q.isError ? (
        <button type="button" className="mt-1 text-left text-[10px] font-semibold text-red-700 underline" onClick={() => void q.refetch()}>
          Retry template list
        </button>
      ) : null}
    </label>
  );
}

type LibraryProps = {
  open: boolean;
  onClose: () => void;
  operatingCompanyId: string;
};

/** Simple library modal: list names + hint to use Book Load picker */
export function LoadTemplateLibrary({ open, onClose, operatingCompanyId }: LibraryProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const templateId = searchParams.get("template_id") ?? undefined;
  const deepLinkCustomerId = searchParams.get("customer_id") ?? undefined;
  // LST-F5174 — visible EntityPicker (URL-only customer seed is not reverse chrome).
  // LV-LOAD-TEMPLATE-LIBRARY-FILTER-SILENT-APPLY — stage until Apply; URL on Apply/Reset.
  const customerIdFromUrl = deepLinkCustomerId?.trim() ?? "";

  function patchListSearchParam(next: { customerId: string }) {
    const nextParams = new URLSearchParams(searchParams);
    if (next.customerId) nextParams.set("customer_id", next.customerId);
    else nextParams.delete("customer_id");
    setSearchParams(nextParams, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    customerId: customerIdFromUrl,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchListSearchParam(next);
    },
  });
  const filterDraft = staged.draft;

  useEffect(() => {
    setApplied((prev) => ({ ...prev, customerId: customerIdFromUrl }));
  }, [customerIdFromUrl]);

  const setCustomerFilter = (customerId: string) => {
    staged.setDraft((d) => ({ ...d, customerId }));
  };
  const effectiveCustomerId = applied.customerId.trim() || undefined;
  const q = useQuery({
    queryKey: ["load-templates", operatingCompanyId, templateId ?? null, effectiveCustomerId ?? null],
    queryFn: () => listLoadTemplates(operatingCompanyId, { template_id: templateId, customer_id: effectiveCustomerId }),
    enabled: Boolean(operatingCompanyId) && open,
  });
  const rows: LoadTemplateRow[] = useMemo(() => q.data?.templates ?? [], [q.data?.templates]);

  return (
    <Modal open={open} onClose={onClose} title="Load templates">
      <div className="max-h-[360px] space-y-2 overflow-y-auto text-sm">
        <div className="relative space-y-2" data-testid="load-template-library-filters">
          <label className="block text-[11px] text-slate-600">
            Customer
            <EntityPicker
              kind="customer"
              operatingCompanyId={operatingCompanyId}
              value={filterDraft.customerId || null}
              onChange={(next) => setCustomerFilter(next ?? "")}
              allowCreate={false}
              placeholder="All customers"
              className="mt-1"
              dataTestId="load-template-library-filter-customer"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" data-testid="load-template-library-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="load-template-library-filter-cancel"
              onClick={staged.cancel}
              disabled={!staged.dirty}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="load-template-library-filter-reset"
              onClick={() => {
                staged.cancel();
                setApplied(EMPTY_FILTERS);
                patchListSearchParam(EMPTY_FILTERS);
              }}
            >
              Reset
            </Button>
          </div>
        </div>
        {q.isLoading ? <div className="text-gray-500">Loading…</div> : null}
        {q.isError ? (
          <ListErrorState title="Couldn't load saved templates" status={0} message={undefined} onRetry={() => void q.refetch()} />
        ) : null}
        {!q.isLoading && !q.isError && rows.length === 0 ? <div className="text-gray-500">No saved templates. Use “Save as template” on a load.</div> : null}
        {rows.map((t) => (
          <div key={t.id} className="rounded-sm border border-gray-200 p-2" data-load-template-id={t.id}>
            <div className="font-semibold text-gray-800">{t.name}</div>
            <div className="text-[11px] text-gray-500">Updated {t.updated_at ? new Date(t.updated_at).toLocaleString() : "—"}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="button" size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}

type SaveModalProps = {
  open: boolean;
  onClose: () => void;
  operatingCompanyId: string;
  initialJson: Record<string, unknown>;
  /** Source load for Exact Leaves reverse EntityLinks (optional). */
  loadId?: string | null;
  loadNumber?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  onSaved?: () => void;
};

export function SaveLoadTemplateModal({ open, onClose, operatingCompanyId, initialJson, loadId, loadNumber, customerId, customerName, onSaved }: SaveModalProps) {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Save-time Customer scope is editable (defaults to the inherited source load's customer, when
  // saving from a load) — the template's own customer_id/customer_name are what the Load Templates
  // library filter matches on (dispatch-refinements.service.ts's template_json->>'customer_id'), so
  // a read-only inherited value left the operator no way to save a cross-customer / generic template.
  const [templateCustomerId, setTemplateCustomerId] = useState<string | null>(customerId ?? null);
  const [templateCustomerName, setTemplateCustomerName] = useState<string | null>(customerName ?? null);
  const scopeGenerationRef = useRef(0);
  useEffect(() => {
    scopeGenerationRef.current += 1;
    setName("");
    setErr(null);
    setPending(false);
    setTemplateCustomerId(customerId ?? null);
    setTemplateCustomerName(customerName ?? null);
  }, [customerId, customerName, loadId, open, operatingCompanyId]);

  const closeUnlessPending = () => {
    if (!pending) onClose();
  };

  return (
    <Modal open={open} onClose={closeUnlessPending} title="Save load as template">
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          if (name.trim().length < 2) {
            setErr("Name required");
            return;
          }
          const submittedGeneration = scopeGenerationRef.current;
          const submittedCompanyId = operatingCompanyId;
          const submittedName = name.trim();
          const submittedTemplateJson = {
            ...initialJson,
            customer_id: templateCustomerId || undefined,
            customer_name: templateCustomerName || undefined,
          };
          const submittedOnSaved = onSaved;
          const submittedOnClose = onClose;
          setPending(true);
          try {
            await createLoadTemplate({
              operating_company_id: submittedCompanyId,
              name: submittedName,
              template_json: submittedTemplateJson,
            });
            if (scopeGenerationRef.current !== submittedGeneration) return;
            submittedOnSaved?.();
            submittedOnClose();
          } catch {
            if (scopeGenerationRef.current === submittedGeneration) setErr("Save failed");
          } finally {
            if (scopeGenerationRef.current === submittedGeneration) setPending(false);
          }
        }}
      >

        {(loadId || customerId) ? (
          <div
            className="flex flex-wrap gap-x-3 gap-y-1 rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700"
            data-testid="save-load-template-modal-entitylinks"
          >
            {loadId ? (
              <span>
                Load:{" "}
                <EntityLinkOrTombstone kind="load" id={loadId} name={loadNumber} noun="Load" />
              </span>
            ) : null}
            {customerId ? (
              <span>
                Customer:{" "}
                <EntityLinkOrTombstone kind="customer" id={customerId} name={customerName} noun="Customer" />
              </span>
            ) : null}
          </div>
        ) : null}
        <label className="block text-[11px] text-slate-600">
          Template customer (editable — defaults to the source load's customer above; clear for a generic template)
          <EntityPicker
            kind="customer"
            operatingCompanyId={operatingCompanyId}
            value={templateCustomerId}
            onChange={(next, option) => {
              setTemplateCustomerId(next);
              setTemplateCustomerName(next ? option?.label ?? null : null);
            }}
            allowCreate={false}
            allowClear
            disabled={pending}
            placeholder="No customer (generic template)"
            className="mt-1"
            dataTestId="save-load-template-modal-customer"
          />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          Template name
          <input value={name} onChange={(ev) => setName(ev.target.value)} disabled={pending} className="mt-0.5 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm disabled:opacity-60" />
        </label>
        {err ? <div className="text-xs text-red-600">{err}</div> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={closeUnlessPending} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={pending}>
            Save template
          </Button>
        </div>
      </form>
    </Modal>
  );
}
