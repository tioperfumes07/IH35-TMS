import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { listMexicoStates, listUsStates } from "../api/catalogs";
import { ApiError } from "../api/client";
import { checkReturningDriver, createDriver, listDrivers, type ReturningDetectionResult } from "../api/mdata";
import { Button } from "../components/Button";
import { Combobox } from "../components/Combobox";
import { DataTable } from "../components/DataTable";
import { DataPanel } from "../components/layout/DataPanel";
import { DataPanelRow } from "../components/layout/DataPanelRow";
import { KpiCard } from "../components/layout/KpiCard";
import { KpiStrip } from "../components/layout/KpiStrip";
import { PageHeader } from "../components/layout/PageHeader";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { colors } from "../design/tokens";

const statusOptions = ["All", "Probation", "Active", "Inactive", "Terminated", "OnLeave"] as const;
const statusFilterComboboxOptions = statusOptions.map((value) => ({ value, label: value === "All" ? "All statuses" : value }));
const statusFieldComboboxOptions = statusOptions
  .filter((value) => value !== "All")
  .map((value) => ({ value, label: value }));
const cdlClassComboboxOptions = ["A", "B", "C"].map((value) => ({ value, label: value }));
const payBasisComboboxOptions = [
  { value: "short_miles", label: "Short Miles" },
  { value: "practical_miles", label: "Practical Miles" },
];

function normalizePhoneDigits(value: string) {
  return value.replace(/\D/g, "").slice(-10);
}

const createDriverSchema = z.object({
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  phone_input: z.string().trim().min(1).refine((value) => normalizePhoneDigits(value).length === 10, "phone must have 10 digits"),
  country_code: z.enum(["+1", "+52"]).default("+1"),
  email: z.string().trim().email().optional().or(z.literal("")),
  cdl_number: z.string().trim().optional(),
  cdl_state: z.string().trim().optional(),
  cdl_class: z.enum(["A", "B", "C"]).optional(),
  cdl_expires_at: z.string().optional(),
  hire_date: z.string().optional(),
  pay_basis: z.enum(["short_miles", "practical_miles"]).default("short_miles"),
  dot_medical_expires_at: z.string().optional(),
  visa_type: z.string().trim().optional(),
  visa_number: z.string().trim().optional(),
  visa_expires_at: z.string().optional(),
  passport_number: z.string().trim().optional(),
  passport_expires_at: z.string().optional(),
  ine_number: z.string().trim().optional(),
  curp: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^[A-Z0-9]{18}$/i.test(value), "CURP must be 18 alphanumeric characters"),
  mx_address_line1: z.string().trim().optional(),
  mx_address_line2: z.string().trim().optional(),
  mx_city: z.string().trim().optional(),
  mx_state: z.string().trim().optional(),
  mx_postal_code: z.string().trim().optional(),
  emergency_contact_name: z.string().trim().optional(),
  emergency_contact_relationship: z.string().trim().optional(),
  emergency_contact_phone_primary: z.string().trim().optional(),
  emergency_contact_phone_alternate: z.string().trim().optional(),
  emergency_contact_address: z.string().trim().optional(),
  emergency_contact_notes: z.string().trim().optional(),
  status: z.enum(["Probation", "Active", "Inactive", "Terminated", "OnLeave"]).default("Probation"),
});

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function getDetectionSeverityClass(detection: ReturningDetectionResult | null) {
  if (!detection) return "border-gray-300 bg-gray-50 text-gray-800";
  if (detection.severity_summary.severe_count > 0) return "border-red-300 bg-red-50 text-red-900";
  if (detection.severity_summary.warning_count > 0) return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-blue-300 bg-blue-50 text-blue-900";
}

export function DriversPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]>("All");
  const [addOpen, setAddOpen] = useState(false);
  const [showMexicanIdentity, setShowMexicanIdentity] = useState(false);
  const [showVisaEmergency, setShowVisaEmergency] = useState(false);
  const [returningDetection, setReturningDetection] = useState<ReturningDetectionResult | null>(null);
  const [returningCheckLoading, setReturningCheckLoading] = useState(false);
  const [overrideReturningWarning, setOverrideReturningWarning] = useState(false);
  const [rehireAction, setRehireAction] = useState<"rehire" | "new">("rehire");
  const [selectedPriorDriverId, setSelectedPriorDriverId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    first_name: "",
    last_name: "",
    phone_input: "",
    country_code: "+1",
    email: "",
    cdl_number: "",
    cdl_state: "",
    cdl_class: "A",
    cdl_expires_at: "",
    hire_date: "",
    pay_basis: "short_miles",
    dot_medical_expires_at: "",
    visa_type: "",
    visa_number: "",
    visa_expires_at: "",
    passport_number: "",
    passport_expires_at: "",
    ine_number: "",
    curp: "",
    mx_address_line1: "",
    mx_address_line2: "",
    mx_city: "",
    mx_state: "",
    mx_postal_code: "",
    emergency_contact_name: "",
    emergency_contact_relationship: "",
    emergency_contact_phone_primary: "",
    emergency_contact_phone_alternate: "",
    emergency_contact_address: "",
    emergency_contact_notes: "",
    status: "Probation",
    allow_phone_login: "false",
  });

  useEffect(() => {
    if (!addOpen) return;
    const curp = form.curp?.trim().toUpperCase() ?? "";
    const cdlNumber = form.cdl_number?.trim().toUpperCase() ?? "";
    const cdlState = form.cdl_state?.trim().toUpperCase() ?? "";
    const hasCurp = curp.length === 18;
    const hasCdlPair = cdlNumber.length > 0 && cdlState.length > 0;

    if (!hasCurp && !hasCdlPair) {
      setReturningDetection(null);
      setOverrideReturningWarning(false);
      setReturningCheckLoading(false);
      return;
    }

    let cancelled = false;
    setReturningCheckLoading(true);
    const timeout = window.setTimeout(async () => {
      try {
        const result = await checkReturningDriver(hasCurp ? curp : undefined, hasCdlPair ? cdlNumber : undefined, hasCdlPair ? cdlState : undefined);
        if (cancelled) return;
        setReturningDetection(result.returning_driver ? result : null);
        if (!result.returning_driver) setOverrideReturningWarning(false);
      } catch {
        if (!cancelled) {
          setReturningDetection(null);
          setOverrideReturningWarning(false);
        }
      } finally {
        if (!cancelled) setReturningCheckLoading(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [addOpen, form.curp, form.cdl_number, form.cdl_state]);

  const usStatesQuery = useQuery({
    queryKey: ["catalogs", "us-states"],
    queryFn: () => listUsStates().then((result) => result.states),
  });

  const mexicoStatesQuery = useQuery({
    queryKey: ["catalogs", "mexico-states"],
    queryFn: () => listMexicoStates().then((result) => result.states),
  });

  const terminatedMatches = useMemo(() => {
    const deduped = new Map<
      string,
      {
        driverId: string;
        label: string;
        eventDate: string;
      }
    >();
    for (const event of returningDetection?.matched_events ?? []) {
      if (event.matched_driver_status !== "Terminated") continue;
      const previous = deduped.get(event.matched_driver_id);
      if (previous && previous.eventDate >= event.event_date) continue;
      const reason = event.termination_reason?.code ?? "termination";
      deduped.set(event.matched_driver_id, {
        driverId: event.matched_driver_id,
        eventDate: event.event_date,
        label: `${event.matched_driver_name} - terminated ${event.event_date} (${reason})`,
      });
    }
    return Array.from(deduped.values());
  }, [returningDetection]);

  useEffect(() => {
    if (!returningDetection?.returning_driver) {
      setRehireAction("rehire");
      setSelectedPriorDriverId(null);
      return;
    }
    if (terminatedMatches.length === 0) {
      setRehireAction("new");
      setSelectedPriorDriverId(null);
      return;
    }
    setRehireAction("rehire");
    setSelectedPriorDriverId((current) => current ?? terminatedMatches[0]?.driverId ?? null);
  }, [returningDetection, terminatedMatches]);

  const driversQuery = useQuery({
    queryKey: ["drivers", { status: statusFilter, search }],
    queryFn: () =>
      listDrivers({
        status: statusFilter,
        search,
      }).then((result) => result.drivers),
  });

  const createMutation = useMutation({
    mutationFn: createDriver,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setAddOpen(false);
      pushToast("Driver created", "success");
      setForm({
        first_name: "",
        last_name: "",
        phone_input: "",
        country_code: "+1",
        email: "",
        cdl_number: "",
        cdl_state: "",
        cdl_class: "A",
        cdl_expires_at: "",
        hire_date: "",
        pay_basis: "short_miles",
        dot_medical_expires_at: "",
        visa_type: "",
        visa_number: "",
        visa_expires_at: "",
        passport_number: "",
        passport_expires_at: "",
        ine_number: "",
        curp: "",
        mx_address_line1: "",
        mx_address_line2: "",
        mx_city: "",
        mx_state: "",
        mx_postal_code: "",
        emergency_contact_name: "",
        emergency_contact_relationship: "",
        emergency_contact_phone_primary: "",
        emergency_contact_phone_alternate: "",
        emergency_contact_address: "",
        emergency_contact_notes: "",
        status: "Probation",
        allow_phone_login: "false",
      });
      setShowMexicanIdentity(false);
      setShowVisaEmergency(false);
      setReturningDetection(null);
      setOverrideReturningWarning(false);
      setRehireAction("rehire");
      setSelectedPriorDriverId(null);
    },
  });

  const drivers = useMemo(() => driversQuery.data ?? [], [driversQuery.data]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Drivers"
        subtitle={`${drivers.length} new in last 3 days`}
        actions={<Button onClick={() => setAddOpen(true)}>Add Driver</Button>}
      />

      <KpiStrip>
        <KpiCard label="Active" number={drivers.filter((d) => d.status === "Active").length} accent={colors.drivers.strong} />
        <KpiCard label="On Loads" number="—" accent={colors.dispatch.strong} />
        <KpiCard label="Available" number="—" accent={colors.info.strong} />
        <KpiCard label="On Leave" number={drivers.filter((d) => d.status === "OnLeave").length} accent={colors.warn.strong} />
        <KpiCard label="Settle Due" number="—" accent={colors.accounting.strong} />
        <KpiCard label="Drivers Owe" number="—" accent={colors.crit.strong} />
        <KpiCard label="Escrow" number="—" accent={colors.fleet.strong} />
      </KpiStrip>

      <div className="flex flex-wrap gap-2">
        <div className="w-full max-w-[220px]">
          <Combobox
            options={statusFilterComboboxOptions}
            value={statusFilter}
            onChange={(value) => setStatusFilter((value as (typeof statusOptions)[number]) ?? "All")}
            allowClear
            placeholder="All statuses"
          />
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name"
          className="h-8 w-full max-w-xs rounded border border-gray-300 px-2 text-[13px]"
        />
      </div>

      <DataTable
        rows={drivers}
        loading={driversQuery.isLoading}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/drivers/${row.id}`)}
        columns={[
          {
            key: "name",
            label: "Name",
            sortable: true,
            render: (row) => `${row.first_name} ${row.last_name}`,
          },
          { key: "phone", label: "Phone" },
          { key: "cdl_number", label: "CDL #" },
          {
            key: "cdl_expires_at",
            label: "CDL Expires",
            render: (row) => formatDate(row.cdl_expires_at),
          },
          {
            key: "status",
            label: "Status",
            render: (row) => <StatusBadge status={row.status} />,
          },
          {
            key: "hire_date",
            label: "Hire Date",
            render: (row) => formatDate(row.hire_date),
          },
        ]}
      />

      <div className="grid gap-3 md:grid-cols-2">
        {[
          "Settlements Ready",
          "Debt Alert",
          "Active Drivers Samsara Live",
          "Permit Expirations",
        ].map((title) => (
          <DataPanel key={title} title={title} accentColor={colors.accounting.strong}>
            <DataPanelRow>
              <span className="text-xs text-gray-500">Coming in Phase X</span>
              <span />
            </DataPanelRow>
          </DataPanel>
        ))}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Driver">
        <form
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const parsed = createDriverSchema.safeParse(form);
            if (!parsed.success) {
              pushToast("Please complete required fields", "error");
              return;
            }

            try {
              const normalizedPhone = `${parsed.data.country_code}${normalizePhoneDigits(parsed.data.phone_input)}`;
              const shouldLinkRehire =
                Boolean(returningDetection?.returning_driver) &&
                overrideReturningWarning &&
                rehireAction === "rehire" &&
                Boolean(selectedPriorDriverId);
              await createMutation.mutateAsync({
                first_name: parsed.data.first_name,
                last_name: parsed.data.last_name,
                phone: normalizedPhone,
                email: parsed.data.email || undefined,
                cdl_number: parsed.data.cdl_number || undefined,
                cdl_state: parsed.data.cdl_state || undefined,
                cdl_class: parsed.data.cdl_class,
                cdl_expires_at: parsed.data.cdl_expires_at || undefined,
                hire_date: parsed.data.hire_date || undefined,
                pay_basis: parsed.data.pay_basis,
                dot_medical_expires_at: parsed.data.dot_medical_expires_at || undefined,
                visa_type: parsed.data.visa_type || undefined,
                visa_number: parsed.data.visa_number || undefined,
                visa_expires_at: parsed.data.visa_expires_at || undefined,
                passport_number: parsed.data.passport_number || undefined,
                passport_expires_at: parsed.data.passport_expires_at || undefined,
                ine_number: parsed.data.ine_number || undefined,
                curp: parsed.data.curp || undefined,
                mx_address_line1: parsed.data.mx_address_line1 || undefined,
                mx_address_line2: parsed.data.mx_address_line2 || undefined,
                mx_city: parsed.data.mx_city || undefined,
                mx_state: parsed.data.mx_state || undefined,
                mx_postal_code: parsed.data.mx_postal_code || undefined,
                emergency_contact_name: parsed.data.emergency_contact_name || undefined,
                emergency_contact_relationship: parsed.data.emergency_contact_relationship || undefined,
                emergency_contact_phone_primary: parsed.data.emergency_contact_phone_primary || undefined,
                emergency_contact_phone_alternate: parsed.data.emergency_contact_phone_alternate || undefined,
                emergency_contact_address: parsed.data.emergency_contact_address || undefined,
                emergency_contact_notes: parsed.data.emergency_contact_notes || undefined,
                status: parsed.data.status,
                create_login_user: form.allow_phone_login === "true",
                override_returning_warning: returningDetection?.returning_driver ? overrideReturningWarning : undefined,
                is_rehire: shouldLinkRehire ? true : undefined,
                prior_driver_id: shouldLinkRehire ? selectedPriorDriverId ?? undefined : undefined,
              });
            } catch (error) {
              if (error instanceof ApiError && error.status === 409) {
                const detectionPayload = error.data as ReturningDetectionResult & { error?: string };
                if (detectionPayload?.error === "returning_driver_detected") {
                  setReturningDetection({
                    returning_driver: true,
                    matched_events: detectionPayload.matched_events ?? [],
                    severity_summary: detectionPayload.severity_summary ?? { severe_count: 0, warning_count: 0, info_count: 0 },
                  });
                  setOverrideReturningWarning(false);
                  setRehireAction("rehire");
                  setSelectedPriorDriverId(null);
                  pushToast("Returning driver records found. Review and confirm override.", "error");
                  return;
                }
              }
              if (error instanceof ApiError && error.status === 409) {
                pushToast("Driver with this CDL # already exists", "error");
                return;
              }
              pushToast("Failed to create driver", "error");
            }
          }}
        >
          {[
            ["first_name", "First Name"],
            ["last_name", "Last Name"],
            ["email", "Email"],
            ["cdl_number", "CDL #"],
            ["cdl_expires_at", "CDL Expires"],
            ["hire_date", "Hire Date"],
            ["dot_medical_expires_at", "DOT Medical Expires"],
          ].map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">{label}</label>
              <input
                type={key.includes("date") || key.includes("expires") ? "date" : "text"}
                value={form[key] ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                className="rounded border border-gray-300 px-2 py-2 text-sm"
              />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">CDL State</label>
            <Combobox
              options={(usStatesQuery.data ?? []).map((state) => ({
                value: state.code,
                label: `${state.code} - ${state.name}`,
                sublabel: state.region,
              }))}
              value={form.cdl_state || null}
              onChange={(nextValue) => setForm((current) => ({ ...current, cdl_state: nextValue ?? "" }))}
              placeholder="Select US state"
              loading={usStatesQuery.isLoading}
              disabled={usStatesQuery.isError}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Country</label>
            <select
              value={form.country_code}
              onChange={(event) => setForm((current) => ({ ...current, country_code: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="+1">US (+1)</option>
              <option value="+52">Mexico (+52)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Phone (10 digits)</label>
            <input
              value={form.phone_input}
              onChange={(event) => setForm((current) => ({ ...current, phone_input: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
              placeholder="(956) 555-0001"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">CDL Class</label>
            <Combobox
              options={cdlClassComboboxOptions}
              value={form.cdl_class || null}
              onChange={(nextValue) => setForm((current) => ({ ...current, cdl_class: nextValue ?? "" }))}
              placeholder="Select CDL class"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Status</label>
            <Combobox
              options={statusFieldComboboxOptions}
              value={form.status || null}
              onChange={(nextValue) => setForm((current) => ({ ...current, status: nextValue ?? "" }))}
              placeholder="Select status"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Pay Basis</label>
            <Combobox
              options={payBasisComboboxOptions}
              value={form.pay_basis || null}
              onChange={(nextValue) => setForm((current) => ({ ...current, pay_basis: nextValue ?? "" }))}
              placeholder="Select pay basis"
            />
          </div>
          <div className="col-span-full rounded-md border border-gray-200 p-3">
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.allow_phone_login === "true"}
                onChange={(event) => setForm((current) => ({ ...current, allow_phone_login: String(event.target.checked) }))}
                className="mt-0.5"
              />
              <span>
                Allow phone login (creates a user account so this driver can sign in via WhatsApp/SMS)
              </span>
            </label>
          </div>

          <div className="col-span-full space-y-2 rounded-md border border-gray-200 p-3">
            <button
              type="button"
              onClick={() => setShowMexicanIdentity((value) => !value)}
              className="w-full text-left text-sm font-semibold text-gray-700"
            >
              Mexican Identity (optional) {showMexicanIdentity ? "▲" : "▼"}
            </button>
            {showMexicanIdentity ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {[
                  ["ine_number", "INE Number"],
                  ["curp", "CURP"],
                  ["mx_address_line1", "MX Address Line 1"],
                  ["mx_address_line2", "MX Address Line 2"],
                  ["mx_city", "MX City"],
                  ["mx_postal_code", "MX Postal Code"],
                ].map(([key, label]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600">{label}</label>
                    <input
                      type="text"
                      value={form[key] ?? ""}
                      onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                      className="rounded border border-gray-300 px-2 py-2 text-sm"
                    />
                  </div>
                ))}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">MX State</label>
                  <Combobox
                    options={(mexicoStatesQuery.data ?? []).map((state) => ({
                      value: state.code,
                      label: `${state.code} - ${state.name}`,
                      sublabel: state.region,
                    }))}
                    value={form.mx_state || null}
                    onChange={(nextValue) => setForm((current) => ({ ...current, mx_state: nextValue ?? "" }))}
                    placeholder="Select Mexico state"
                    loading={mexicoStatesQuery.isLoading}
                    disabled={mexicoStatesQuery.isError}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="col-span-full space-y-2 rounded-md border border-gray-200 p-3">
            <button
              type="button"
              onClick={() => setShowVisaEmergency((value) => !value)}
              className="w-full text-left text-sm font-semibold text-gray-700"
            >
              Visa & Emergency Contact (optional) {showVisaEmergency ? "▲" : "▼"}
            </button>
            {showVisaEmergency ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {[
                  ["visa_type", "Visa Type"],
                  ["visa_number", "Visa Number"],
                  ["visa_expires_at", "Visa Expires"],
                  ["passport_number", "Passport Number"],
                  ["passport_expires_at", "Passport Expires"],
                  ["emergency_contact_name", "Emergency Contact Name"],
                  ["emergency_contact_relationship", "Relationship"],
                  ["emergency_contact_phone_primary", "Emergency Phone Primary"],
                  ["emergency_contact_phone_alternate", "Emergency Phone Alternate"],
                ].map(([key, label]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600">{label}</label>
                    <input
                      type={key.includes("expires") ? "date" : "text"}
                      value={form[key] ?? ""}
                      onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                      className="rounded border border-gray-300 px-2 py-2 text-sm"
                    />
                  </div>
                ))}
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">Emergency Contact Address</label>
                  <textarea
                    value={form.emergency_contact_address ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, emergency_contact_address: event.target.value }))}
                    className="rounded border border-gray-300 px-2 py-2 text-sm"
                    rows={2}
                  />
                </div>
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">Emergency Contact Notes</label>
                  <textarea
                    value={form.emergency_contact_notes ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, emergency_contact_notes: event.target.value }))}
                    className="rounded border border-gray-300 px-2 py-2 text-sm"
                    rows={2}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {returningDetection?.returning_driver ? (
            <div className={`col-span-full rounded-md border p-3 text-sm ${getDetectionSeverityClass(returningDetection)}`}>
              <div className="font-semibold">RETURNING DRIVER DETECTED</div>
              <div className="mt-1 text-xs">
                Prior safety events match this CURP/CDL identity. Review before proceeding.
              </div>
              <div className="mt-2 max-h-40 space-y-1 overflow-auto rounded bg-white/70 p-2 text-xs">
                {returningDetection.matched_events.map((event) => (
                  <div key={event.event_id} className="rounded border border-gray-200 bg-white p-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span>{event.event_date}</span>
                      <StatusBadge status={event.severity} />
                    </div>
                    <div className="font-medium capitalize">{event.event_type}</div>
                    <div>{event.summary}</div>
                    <div className="text-[11px] text-gray-600">From prior record under name {event.matched_driver_name}</div>
                  </div>
                ))}
              </div>
              <label className="mt-2 flex items-start gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={overrideReturningWarning}
                  onChange={(event) => setOverrideReturningWarning(event.target.checked)}
                  className="mt-0.5"
                />
                <span>I have reviewed prior safety records and want to proceed with this hire</span>
              </label>
              {overrideReturningWarning && terminatedMatches.length > 0 ? (
                <div className="mt-2 space-y-2 rounded border border-amber-200 bg-amber-50 p-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="rehire_action"
                      checked={rehireAction === "new"}
                      onChange={() => setRehireAction("new")}
                    />
                    Hire as a NEW driver (not linked to prior record)
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="rehire_action"
                      checked={rehireAction === "rehire"}
                      onChange={() => setRehireAction("rehire")}
                    />
                    Mark as REHIRE of prior driver
                  </label>
                  {rehireAction === "rehire" ? (
                    <Combobox
                      options={terminatedMatches.map((match) => ({ value: match.driverId, label: match.label }))}
                      value={selectedPriorDriverId}
                      onChange={(nextValue) => setSelectedPriorDriverId(nextValue)}
                      placeholder="Select prior terminated driver"
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="col-span-full flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createMutation.isPending}
              disabled={
                (returningDetection?.returning_driver && !overrideReturningWarning) ||
                (overrideReturningWarning && rehireAction === "rehire" && terminatedMatches.length > 0 && !selectedPriorDriverId) ||
                returningCheckLoading
              }
            >
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
