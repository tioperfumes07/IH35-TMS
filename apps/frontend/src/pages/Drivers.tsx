import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { listMexicoStates, listUsStates } from "../api/catalogs";
import { ApiError } from "../api/client";
import {
  checkReturningDriver,
  createDriver,
  createDriverTeam,
  deactivateDriverTeam,
  getDriverTeam,
  listDriverTeams,
  listDrivers,
  type DriverTeamSplitMethod,
  type ReturningDetectionResult,
  updateDriverTeam,
} from "../api/mdata";
import { listMyCompanies } from "../api/org";
import { Button } from "../components/Button";
import { Combobox } from "../components/Combobox";
import { DataTable } from "../components/DataTable";
import { DataPanel } from "../components/layout/DataPanel";
import { DataPanelRow } from "../components/layout/DataPanelRow";
import { KpiCard } from "../components/layout/KpiCard";
import { KpiStrip } from "../components/layout/KpiStrip";
import { PageHeader } from "../components/layout/PageHeader";
import { Modal } from "../components/Modal";
import { ActionButton } from "../components/shared/ActionButton";
import { ListErrorBanner } from "../components/shared/ListErrorBanner";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { FieldError, fieldErrorClassname } from "../components/forms/FieldError";
import { FormErrorBanner } from "../components/forms/FormErrorBanner";
import { useFormValidation } from "../components/forms/useFormValidation";
import { useCompanyContext } from "../contexts/CompanyContext";
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
  operating_company_id: z.string().uuid("operating company is required"),
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
  const { selectedCompanyId } = useCompanyContext();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]>("All");
  const [activeTab, setActiveTab] = useState<"drivers" | "teams">("drivers");
  const [addOpen, setAddOpen] = useState(false);
  const [teamCreateOpen, setTeamCreateOpen] = useState(false);
  const [teamDetailOpen, setTeamDetailOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamForm, setTeamForm] = useState({
    team_name: "",
    primary_driver_id: "",
    co_driver_id: "",
    split_method: "50_50" as DriverTeamSplitMethod,
    primary_share_pct: "50",
    co_share_pct: "50",
    notes: "",
    effective_from: "",
  });
  const [showMexicanIdentity, setShowMexicanIdentity] = useState(false);
  const [showVisaEmergency, setShowVisaEmergency] = useState(false);
  const [returningDetection, setReturningDetection] = useState<ReturningDetectionResult | null>(null);
  const [returningCheckLoading, setReturningCheckLoading] = useState(false);
  const [overrideReturningWarning, setOverrideReturningWarning] = useState(false);
  const [rehireAction, setRehireAction] = useState<"rehire" | "new">("rehire");
  const [selectedPriorDriverId, setSelectedPriorDriverId] = useState<string | null>(null);
  const [createSummary, setCreateSummary] = useState<{
    driver_id: string;
    phone: string;
    invite_url: string;
    linked_user_event_type: "existing_user" | "new_user_created";
  } | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    operating_company_id: "",
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

  const companiesQuery = useQuery({
    queryKey: ["org", "my-companies"],
    queryFn: () => listMyCompanies().then((result) => result.companies),
  });

  useEffect(() => {
    if (!addOpen) return;
    if (form.operating_company_id) return;
    const defaultCompany = (companiesQuery.data ?? []).find((company) => company.is_default) ?? companiesQuery.data?.[0];
    if (!defaultCompany) return;
    setForm((current) => ({ ...current, operating_company_id: defaultCompany.id }));
  }, [addOpen, companiesQuery.data, form.operating_company_id]);

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

  const teamsQuery = useQuery({
    queryKey: ["driver-teams", selectedCompanyId],
    queryFn: () => listDriverTeams(selectedCompanyId!).then((result) => result.teams),
    enabled: Boolean(selectedCompanyId),
  });

  const teamDetailQuery = useQuery({
    queryKey: ["driver-team", selectedTeamId, selectedCompanyId],
    queryFn: () => getDriverTeam(selectedTeamId!, selectedCompanyId!).then((result) => result.team),
    enabled: Boolean(selectedTeamId && selectedCompanyId && teamDetailOpen),
  });

  const createTeamMutation = useMutation({
    mutationFn: createDriverTeam,
    onSuccess: async () => {
      pushToast("Team created", "success");
      setTeamCreateOpen(false);
      setTeamForm({
        team_name: "",
        primary_driver_id: "",
        co_driver_id: "",
        split_method: "50_50",
        primary_share_pct: "50",
        co_share_pct: "50",
        notes: "",
        effective_from: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["driver-teams"] });
    },
    onError: (error) => pushToast(String((error as Error).message || error), "error"),
  });

  const updateTeamMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      operating_company_id: string;
      split_method: DriverTeamSplitMethod;
      primary_share_pct?: number;
      co_share_pct?: number;
      effective_from: string;
      reactivate?: boolean;
      notes?: string;
    }) => updateDriverTeam(payload.id, payload),
    onSuccess: async () => {
      pushToast("Team split updated", "success");
      await queryClient.invalidateQueries({ queryKey: ["driver-teams"] });
      await queryClient.invalidateQueries({ queryKey: ["driver-team"] });
    },
    onError: (error) => pushToast(String((error as Error).message || error), "error"),
  });

  const deactivateTeamMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      deactivateDriverTeam(id, { operating_company_id: selectedCompanyId!, reason }),
    onSuccess: async () => {
      pushToast("Team deactivated", "success");
      await queryClient.invalidateQueries({ queryKey: ["driver-teams"] });
      await queryClient.invalidateQueries({ queryKey: ["driver-team"] });
    },
    onError: (error) => pushToast(String((error as Error).message || error), "error"),
  });

  const createMutation = useMutation({
    mutationFn: createDriver,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setAddOpen(false);
      setCreateSummary({
        driver_id: created.id,
        phone: created.phone,
        invite_url: created.invite_url,
        linked_user_event_type: created.linked_user_event_type,
      });
      pushToast("Driver created and invite sent", "success");
      setForm({
        operating_company_id: "",
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
      });
      setShowMexicanIdentity(false);
      setShowVisaEmergency(false);
      setReturningDetection(null);
      setOverrideReturningWarning(false);
      setRehireAction("rehire");
      setSelectedPriorDriverId(null);
    },
  });

  const {
    fieldErrors: driverFieldErrors,
    apiError: driverApiError,
    submit: submitDriverCreate,
    clearFieldError: clearDriverFieldError,
    resetErrors: resetDriverCreateErrors,
  } = useFormValidation({
    schema: createDriverSchema,
    interceptApiError: (error) => {
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
          return true;
        }
      }
      const errorPayload = error instanceof ApiError && error.data && typeof error.data === "object" ? (error.data as { error?: string }) : null;
      if (error instanceof ApiError && error.status === 400 && errorPayload?.error === "operating_company_not_found") {
        pushToast("Select an active operating company", "error");
        return true;
      }
      return false;
    },
    onSubmit: async (parsed) => {
      const normalizedPhone = `${parsed.country_code}${normalizePhoneDigits(parsed.phone_input)}`;
      const shouldLinkRehire =
        Boolean(returningDetection?.returning_driver) &&
        overrideReturningWarning &&
        rehireAction === "rehire" &&
        Boolean(selectedPriorDriverId);
      await createMutation.mutateAsync({
        operating_company_id: parsed.operating_company_id,
        first_name: parsed.first_name,
        last_name: parsed.last_name,
        phone: normalizedPhone,
        email: parsed.email || undefined,
        cdl_number: parsed.cdl_number || undefined,
        cdl_state: parsed.cdl_state || undefined,
        cdl_class: parsed.cdl_class,
        cdl_expires_at: parsed.cdl_expires_at || undefined,
        hire_date: parsed.hire_date || undefined,
        pay_basis: parsed.pay_basis,
        dot_medical_expires_at: parsed.dot_medical_expires_at || undefined,
        visa_type: parsed.visa_type || undefined,
        visa_number: parsed.visa_number || undefined,
        visa_expires_at: parsed.visa_expires_at || undefined,
        passport_number: parsed.passport_number || undefined,
        passport_expires_at: parsed.passport_expires_at || undefined,
        ine_number: parsed.ine_number || undefined,
        curp: parsed.curp || undefined,
        mx_address_line1: parsed.mx_address_line1 || undefined,
        mx_address_line2: parsed.mx_address_line2 || undefined,
        mx_city: parsed.mx_city || undefined,
        mx_state: parsed.mx_state || undefined,
        mx_postal_code: parsed.mx_postal_code || undefined,
        emergency_contact_name: parsed.emergency_contact_name || undefined,
        emergency_contact_relationship: parsed.emergency_contact_relationship || undefined,
        emergency_contact_phone_primary: parsed.emergency_contact_phone_primary || undefined,
        emergency_contact_phone_alternate: parsed.emergency_contact_phone_alternate || undefined,
        emergency_contact_address: parsed.emergency_contact_address || undefined,
        emergency_contact_notes: parsed.emergency_contact_notes || undefined,
        status: parsed.status,
        override_returning_warning: returningDetection?.returning_driver ? overrideReturningWarning : undefined,
        is_rehire: shouldLinkRehire ? true : undefined,
        prior_driver_id: shouldLinkRehire ? selectedPriorDriverId ?? undefined : undefined,
      });
    },
  });

  useEffect(() => {
    if (!addOpen) return;
    resetDriverCreateErrors();
  }, [addOpen, resetDriverCreateErrors]);

  const drivers = useMemo(() => driversQuery.data ?? [], [driversQuery.data]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Drivers"
        subtitle={`${drivers.length} new in last 3 days`}
        actions={<ActionButton onClick={() => setAddOpen(true)}>+ Create Driver</ActionButton>}
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

      <div className="flex items-center gap-2">
        <Button size="sm" variant={activeTab === "drivers" ? "primary" : "secondary"} onClick={() => setActiveTab("drivers")}>
          Drivers
        </Button>
        <Button size="sm" variant={activeTab === "teams" ? "primary" : "secondary"} onClick={() => setActiveTab("teams")}>
          Teams
        </Button>
      </div>

      {activeTab === "teams" ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setTeamCreateOpen(true)}>+ Create Team</Button>
          </div>
          <DataTable
            rows={teamsQuery.data ?? []}
            loading={teamsQuery.isLoading}
            rowKey={(row) => String(row.id)}
            onRowClick={(row) => {
              setSelectedTeamId(String(row.id));
              setTeamDetailOpen(true);
            }}
            columns={[
              {
                key: "team_name",
                label: "Team Name",
                className: "min-w-0 max-w-[240px] whitespace-nowrap",
                render: (row) => {
                  const v = String(row.team_name ?? "—");
                  return (
                    <span title={v !== "—" ? v : undefined} className="single-line-name">
                      {v}
                    </span>
                  );
                },
              },
              {
                key: "primary_driver_name",
                label: "Primary",
                className: "min-w-0 max-w-[240px] whitespace-nowrap",
                render: (row) => {
                  const v = String(row.primary_driver_name ?? row.primary_driver_id ?? "—");
                  return (
                    <span title={v !== "—" ? v : undefined} className="single-line-name">
                      {v}
                    </span>
                  );
                },
              },
              {
                key: "co_driver_name",
                label: "Co",
                className: "min-w-0 max-w-[240px] whitespace-nowrap",
                render: (row) => {
                  const v = String(row.co_driver_name ?? row.secondary_driver_id ?? "—");
                  return (
                    <span title={v !== "—" ? v : undefined} className="single-line-name">
                      {v}
                    </span>
                  );
                },
              },
              {
                key: "split_method",
                label: "Split",
                render: (row) =>
                  `${String(row.split_method)} (${Number(row.primary_share_pct ?? 0)} / ${Number(row.co_share_pct ?? 0)})`,
              },
              { key: "is_active", label: "Status", render: (row) => <StatusBadge status={row.is_active ? "Active" : "Inactive"} /> },
            ]}
          />
        </div>
      ) : null}

      {activeTab === "drivers" ? (
        <>
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

      {driversQuery.isError ? <ListErrorBanner onRetry={() => void driversQuery.refetch()} /> : null}

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
            className: "max-w-[220px] whitespace-nowrap",
            render: (row) => {
              const v = `${row.first_name} ${row.last_name}`;
              return (
                <span title={v} className="single-line-name">
                  {v}
                </span>
              );
            },
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
        </>
      ) : null}

      <Modal open={teamCreateOpen} onClose={() => setTeamCreateOpen(false)} title="Create Team">
        <form
          className="grid grid-cols-1 gap-2 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedCompanyId) {
              pushToast("Select an operating company first", "error");
              return;
            }
            if (!teamForm.primary_driver_id || !teamForm.co_driver_id || !teamForm.team_name.trim()) {
              pushToast("Team name and both drivers are required", "error");
              return;
            }
            void createTeamMutation.mutate({
              operating_company_id: selectedCompanyId,
              team_name: teamForm.team_name.trim(),
              primary_driver_id: teamForm.primary_driver_id,
              co_driver_id: teamForm.co_driver_id,
              split_method: teamForm.split_method,
              primary_share_pct: Number(teamForm.primary_share_pct),
              co_share_pct: Number(teamForm.co_share_pct),
              notes: teamForm.notes.trim() || undefined,
              effective_from: teamForm.effective_from || undefined,
            });
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Team Name</label>
            <input
              value={teamForm.team_name}
              onChange={(event) => setTeamForm((current) => ({ ...current, team_name: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Split Method</label>
            <select
              value={teamForm.split_method}
              onChange={(event) =>
                setTeamForm((current) => ({ ...current, split_method: event.target.value as DriverTeamSplitMethod }))
              }
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="50_50">50_50</option>
              <option value="60_40">60_40</option>
              <option value="70_30">70_30</option>
              <option value="mileage_prorated">mileage_prorated</option>
              <option value="hours_prorated">hours_prorated</option>
              <option value="custom">custom</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Primary Driver</label>
            <select
              value={teamForm.primary_driver_id}
              onChange={(event) => setTeamForm((current) => ({ ...current, primary_driver_id: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="">Select driver</option>
              {(driversQuery.data ?? []).map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.first_name} {driver.last_name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Co Driver</label>
            <select
              value={teamForm.co_driver_id}
              onChange={(event) => setTeamForm((current) => ({ ...current, co_driver_id: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="">Select driver</option>
              {(driversQuery.data ?? []).map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.first_name} {driver.last_name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Primary %</label>
            <input
              type="number"
              value={teamForm.primary_share_pct}
              onChange={(event) => setTeamForm((current) => ({ ...current, primary_share_pct: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Co %</label>
            <input
              type="number"
              value={teamForm.co_share_pct}
              onChange={(event) => setTeamForm((current) => ({ ...current, co_share_pct: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Effective From</label>
            <input
              type="date"
              value={teamForm.effective_from}
              onChange={(event) => setTeamForm((current) => ({ ...current, effective_from: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2 flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Notes</label>
            <textarea
              value={teamForm.notes}
              onChange={(event) => setTeamForm((current) => ({ ...current, notes: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
              rows={3}
            />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setTeamCreateOpen(false)}>Cancel</Button>
            <Button type="submit" loading={createTeamMutation.isPending}>Create Team</Button>
          </div>
        </form>
      </Modal>

      <Modal open={teamDetailOpen} onClose={() => setTeamDetailOpen(false)} title="Team Detail">
        {teamDetailQuery.data ? (
          <div className="space-y-3">
            <div className="rounded border border-gray-200 bg-gray-50 p-2 text-xs">
              <p className="font-semibold">{String(teamDetailQuery.data.team_name)}</p>
              <p>Primary: {String(teamDetailQuery.data.primary_driver_name ?? teamDetailQuery.data.primary_driver_id)}</p>
              <p>Co: {String(teamDetailQuery.data.co_driver_name ?? teamDetailQuery.data.secondary_driver_id)}</p>
              <p>Split: {String(teamDetailQuery.data.split_method)} ({Number(teamDetailQuery.data.primary_share_pct)} / {Number(teamDetailQuery.data.co_share_pct)})</p>
            </div>
            <div className="rounded border border-gray-200 bg-white p-2 text-xs">
              <p className="mb-1 font-semibold">Settlement history per load</p>
              {(teamDetailQuery.data.settlement_history ?? []).length === 0 ? (
                <p className="text-gray-500">No split history yet.</p>
              ) : (
                (teamDetailQuery.data.settlement_history ?? []).slice(0, 20).map((row, index) => (
                  <div key={`${index}-${String((row as Record<string, unknown>).id ?? "")}`} className="border-t border-gray-100 py-1">
                    Load {String((row as Record<string, unknown>).load_id ?? "—")} · Driver {String((row as Record<string, unknown>).driver_id ?? "—")} ·
                    Pay ${((Number((row as Record<string, unknown>).driver_pay_cents ?? 0) || 0) / 100).toFixed(2)}
                  </div>
                ))
              )}
            </div>
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">
              <p className="mb-1 font-semibold">Update Split</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={teamForm.effective_from}
                  onChange={(event) => setTeamForm((current) => ({ ...current, effective_from: event.target.value }))}
                  className="rounded border border-gray-300 px-2 py-1"
                />
                <select
                  value={teamForm.split_method}
                  onChange={(event) =>
                    setTeamForm((current) => ({ ...current, split_method: event.target.value as DriverTeamSplitMethod }))
                  }
                  className="rounded border border-gray-300 px-2 py-1"
                >
                  <option value="50_50">50_50</option>
                  <option value="60_40">60_40</option>
                  <option value="70_30">70_30</option>
                  <option value="mileage_prorated">mileage_prorated</option>
                  <option value="hours_prorated">hours_prorated</option>
                  <option value="custom">custom</option>
                </select>
                <input
                  type="number"
                  value={teamForm.primary_share_pct}
                  onChange={(event) => setTeamForm((current) => ({ ...current, primary_share_pct: event.target.value }))}
                  className="rounded border border-gray-300 px-2 py-1"
                  placeholder="Primary %"
                />
                <input
                  type="number"
                  value={teamForm.co_share_pct}
                  onChange={(event) => setTeamForm((current) => ({ ...current, co_share_pct: event.target.value }))}
                  className="rounded border border-gray-300 px-2 py-1"
                  placeholder="Co %"
                />
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (!selectedCompanyId || !selectedTeamId || !teamForm.effective_from) {
                      pushToast("effective_from is required", "error");
                      return;
                    }
                    void updateTeamMutation.mutate({
                      id: selectedTeamId,
                      operating_company_id: selectedCompanyId,
                      split_method: teamForm.split_method,
                      primary_share_pct: Number(teamForm.primary_share_pct),
                      co_share_pct: Number(teamForm.co_share_pct),
                      effective_from: teamForm.effective_from,
                      notes: teamForm.notes || undefined,
                    });
                  }}
                >
                  Save Split
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (!selectedTeamId) return;
                    const reason = window.prompt("Reason for deactivation (min 10 chars):", "");
                    if (!reason || reason.trim().length < 10) return;
                    void deactivateTeamMutation.mutate({ id: selectedTeamId, reason: reason.trim() });
                  }}
                >
                  Deactivate Team
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">Loading team detail...</div>
        )}
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Create Driver">
        <form
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submitDriverCreate(form as z.infer<typeof createDriverSchema>);
          }}
        >
          <div className="col-span-full">
            <FormErrorBanner message={driverApiError} />
          </div>
          <div className="col-span-full flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Operating Company</label>
            <Combobox
              dataField="operating_company_id"
              options={(companiesQuery.data ?? []).map((company) => ({
                value: company.id,
                label: `${company.code} - ${company.short_name || company.legal_name}`,
                sublabel: company.legal_name,
              }))}
              value={form.operating_company_id || null}
              onChange={(nextValue) => {
                clearDriverFieldError("operating_company_id");
                setForm((current) => ({ ...current, operating_company_id: nextValue ?? "" }));
              }}
              placeholder="Select operating company"
              loading={companiesQuery.isLoading}
              disabled={companiesQuery.isError}
              error={driverFieldErrors.operating_company_id}
            />
            <FieldError id="operating_company_id" message={driverFieldErrors.operating_company_id} />
          </div>
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
                data-field={key}
                type={key.includes("date") || key.includes("expires") ? "date" : "text"}
                value={form[key] ?? ""}
                aria-describedby={driverFieldErrors[key] ? `${key}-error` : undefined}
                onChange={(event) => {
                  clearDriverFieldError(key);
                  setForm((current) => ({ ...current, [key]: event.target.value }));
                }}
                className={fieldErrorClassname(Boolean(driverFieldErrors[key]), "rounded border px-2 py-2 text-sm")}
              />
              <FieldError id={key} message={driverFieldErrors[key]} />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">CDL State</label>
            <Combobox
              dataField="cdl_state"
              options={(usStatesQuery.data ?? []).map((state) => ({
                value: state.code,
                label: `${state.code} - ${state.name}`,
                sublabel: state.region,
              }))}
              value={form.cdl_state || null}
              onChange={(nextValue) => {
                clearDriverFieldError("cdl_state");
                setForm((current) => ({ ...current, cdl_state: nextValue ?? "" }));
              }}
              placeholder="Select US state"
              loading={usStatesQuery.isLoading}
              disabled={usStatesQuery.isError}
              error={driverFieldErrors.cdl_state}
            />
            <FieldError id="cdl_state" message={driverFieldErrors.cdl_state} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Country</label>
            <select
              data-field="country_code"
              value={form.country_code}
              aria-describedby={driverFieldErrors.country_code ? "country_code-error" : undefined}
              onChange={(event) => {
                clearDriverFieldError("country_code");
                setForm((current) => ({ ...current, country_code: event.target.value }));
              }}
              className={fieldErrorClassname(Boolean(driverFieldErrors.country_code), "rounded border px-2 py-2 text-sm")}
            >
              <option value="+1">US (+1)</option>
              <option value="+52">Mexico (+52)</option>
            </select>
            <FieldError id="country_code" message={driverFieldErrors.country_code} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Phone (10 digits)</label>
            <input
              data-field="phone_input"
              value={form.phone_input}
              aria-describedby={driverFieldErrors.phone_input ? "phone_input-error" : undefined}
              onChange={(event) => {
                clearDriverFieldError("phone_input");
                setForm((current) => ({ ...current, phone_input: event.target.value }));
              }}
              className={fieldErrorClassname(Boolean(driverFieldErrors.phone_input), "rounded border px-2 py-2 text-sm")}
              placeholder="(956) 555-0001"
            />
            <FieldError id="phone_input" message={driverFieldErrors.phone_input} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">CDL Class</label>
            <Combobox
              dataField="cdl_class"
              options={cdlClassComboboxOptions}
              value={form.cdl_class || null}
              onChange={(nextValue) => {
                clearDriverFieldError("cdl_class");
                setForm((current) => ({ ...current, cdl_class: nextValue ?? "" }));
              }}
              placeholder="Select CDL class"
              error={driverFieldErrors.cdl_class}
            />
            <FieldError id="cdl_class" message={driverFieldErrors.cdl_class} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Status</label>
            <Combobox
              dataField="status"
              options={statusFieldComboboxOptions}
              value={form.status || null}
              onChange={(nextValue) => {
                clearDriverFieldError("status");
                setForm((current) => ({ ...current, status: nextValue ?? "" }));
              }}
              placeholder="Select status"
              error={driverFieldErrors.status}
            />
            <FieldError id="status" message={driverFieldErrors.status} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Pay Basis</label>
            <Combobox
              dataField="pay_basis"
              options={payBasisComboboxOptions}
              value={form.pay_basis || null}
              onChange={(nextValue) => {
                clearDriverFieldError("pay_basis");
                setForm((current) => ({ ...current, pay_basis: nextValue ?? "" }));
              }}
              placeholder="Select pay basis"
              error={driverFieldErrors.pay_basis}
            />
            <FieldError id="pay_basis" message={driverFieldErrors.pay_basis} />
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
                      data-field={key}
                      type="text"
                      value={form[key] ?? ""}
                      aria-describedby={driverFieldErrors[key] ? `${key}-error` : undefined}
                      onChange={(event) => {
                        clearDriverFieldError(key);
                        setForm((current) => ({ ...current, [key]: event.target.value }));
                      }}
                      className={fieldErrorClassname(Boolean(driverFieldErrors[key]), "rounded border px-2 py-2 text-sm")}
                    />
                    <FieldError id={key} message={driverFieldErrors[key]} />
                  </div>
                ))}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">MX State</label>
                  <Combobox
                    dataField="mx_state"
                    options={(mexicoStatesQuery.data ?? []).map((state) => ({
                      value: state.code,
                      label: `${state.code} - ${state.name}`,
                      sublabel: state.region,
                    }))}
                    value={form.mx_state || null}
                    onChange={(nextValue) => {
                      clearDriverFieldError("mx_state");
                      setForm((current) => ({ ...current, mx_state: nextValue ?? "" }));
                    }}
                    placeholder="Select Mexico state"
                    loading={mexicoStatesQuery.isLoading}
                    disabled={mexicoStatesQuery.isError}
                    error={driverFieldErrors.mx_state}
                  />
                  <FieldError id="mx_state" message={driverFieldErrors.mx_state} />
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
                      data-field={key}
                      type={key.includes("expires") ? "date" : "text"}
                      value={form[key] ?? ""}
                      aria-describedby={driverFieldErrors[key] ? `${key}-error` : undefined}
                      onChange={(event) => {
                        clearDriverFieldError(key);
                        setForm((current) => ({ ...current, [key]: event.target.value }));
                      }}
                      className={fieldErrorClassname(Boolean(driverFieldErrors[key]), "rounded border px-2 py-2 text-sm")}
                    />
                    <FieldError id={key} message={driverFieldErrors[key]} />
                  </div>
                ))}
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">Emergency Contact Address</label>
                  <textarea
                    data-field="emergency_contact_address"
                    value={form.emergency_contact_address ?? ""}
                    aria-describedby={driverFieldErrors.emergency_contact_address ? "emergency_contact_address-error" : undefined}
                    onChange={(event) => {
                      clearDriverFieldError("emergency_contact_address");
                      setForm((current) => ({ ...current, emergency_contact_address: event.target.value }));
                    }}
                    className={fieldErrorClassname(Boolean(driverFieldErrors.emergency_contact_address), "rounded border px-2 py-2 text-sm")}
                    rows={2}
                  />
                  <FieldError id="emergency_contact_address" message={driverFieldErrors.emergency_contact_address} />
                </div>
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">Emergency Contact Notes</label>
                  <textarea
                    data-field="emergency_contact_notes"
                    value={form.emergency_contact_notes ?? ""}
                    aria-describedby={driverFieldErrors.emergency_contact_notes ? "emergency_contact_notes-error" : undefined}
                    onChange={(event) => {
                      clearDriverFieldError("emergency_contact_notes");
                      setForm((current) => ({ ...current, emergency_contact_notes: event.target.value }));
                    }}
                    className={fieldErrorClassname(Boolean(driverFieldErrors.emergency_contact_notes), "rounded border px-2 py-2 text-sm")}
                    rows={2}
                  />
                  <FieldError id="emergency_contact_notes" message={driverFieldErrors.emergency_contact_notes} />
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
                !form.operating_company_id ||
                (returningDetection?.returning_driver && !overrideReturningWarning) ||
                (overrideReturningWarning && rehireAction === "rehire" && terminatedMatches.length > 0 && !selectedPriorDriverId) ||
                returningCheckLoading
              }
            >
              {createMutation.isPending ? "Creating driver and sending invite..." : "Save"}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal open={Boolean(createSummary)} onClose={() => setCreateSummary(null)} title="Driver created successfully">
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            WhatsApp invite sent to {createSummary?.phone}. Invite expires in 72 hours.
          </p>
          {createSummary?.linked_user_event_type === "existing_user" ? (
            <p className="text-sm text-amber-700">
              Phone {createSummary.phone} was already registered. Linked existing account.
            </p>
          ) : null}
          <div className="rounded border border-gray-200 bg-gray-50 p-2 text-xs break-all">{createSummary?.invite_url}</div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={async () => {
                if (!createSummary?.invite_url) return;
                try {
                  await navigator.clipboard.writeText(createSummary.invite_url);
                  pushToast("Invite URL copied", "success");
                } catch {
                  pushToast("Could not copy invite URL", "error");
                }
              }}
            >
              Copy
            </Button>
            <Button variant="secondary" type="button" onClick={() => setCreateSummary(null)}>
              Done
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!createSummary?.driver_id) return;
                const nextDriverId = createSummary.driver_id;
                setCreateSummary(null);
                navigate(`/drivers/${nextDriverId}`);
              }}
            >
              View Driver
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
