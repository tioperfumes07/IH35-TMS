import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { EntityLink } from "../components/shared/EntityLink";
import { entityLabel } from "../lib/entity-label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import {
  createDispatcherSafetyEvent,
  getUserDetail,
  listDispatcherErrorReasons,
  listDispatcherSafetyEvents,
  updateDispatcherSafetyEvent,
  voidDispatcherSafetyEvent,
  type DispatcherErrorReason,
  type DispatcherSafetyEvent,
} from "../api/identity";
import { listCustomers } from "../api/mdata";
import { formatDateTimeUS, formatDateUS } from "../lib/formatDate";
import { Button } from "../components/Button";
import { ListErrorState } from "../components/ListErrorState";
import { Combobox, type ComboboxOption } from "../components/Combobox";
import { ReferenceSelect } from "../components/parity/ReferenceSelect";
import { EntityPicker } from "../components/parity/EntityPicker";
import { DriverPickerWithCreate } from "../components/drivers/DriverPickerWithCreate";
import { MoneyInput } from "../components/forms/MoneyInput";
import { DatePicker } from "../components/forms/DatePicker";
import { companyToday } from "../lib/businessDate";
import { DataPanel } from "../components/layout/DataPanel";
import { PageHeader } from "../components/layout/PageHeader";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { useAuth } from "../auth/useAuth";
import { useCompanyContext } from "../contexts/CompanyContext";
import { UserActivityTab } from "../components/users/UserActivityTab";
import { ComplaintsReverseSection } from "../components/safety/ComplaintsReverseSection";

type Tab = "profile" | "companies" | "safety" | "activity";

const USER_DETAIL_TAB_IDS = new Set<string>(["profile", "companies", "safety", "activity"]);

export function parseUserDetailTab(raw: string | null): Tab {
  if (raw && USER_DETAIL_TAB_IDS.has(raw)) return raw as Tab;
  return "profile";
}

function eventTypeLabel(eventType: DispatcherErrorReason["event_type"]) {
  return eventType.replaceAll("_", " ");
}

function money(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

const EVENT_TYPE_OPTIONS: ComboboxOption[] = [
  "customer_complaint",
  "missed_appointment",
  "unpaid_invoice_responsibility",
  "abandoned_load_dispatcher_fault",
  "rate_below_threshold_unjustified",
  "driver_complaint_validated",
  "commendation",
  "training_required",
  "policy_violation",
  "other",
].map((value) => ({ value, label: eventTypeLabel(value as DispatcherErrorReason["event_type"]) }));
const SEVERITY_OPTIONS: ComboboxOption[] = [
  { value: "info", label: "info" },
  { value: "warning", label: "warning" },
  { value: "severe", label: "severe" },
];
const COST_RECOVERY_STATUS_OPTIONS: ComboboxOption[] = [
  { value: "pending", label: "pending" },
  { value: "partial", label: "partial" },
  { value: "recovered", label: "recovered" },
  { value: "waived", label: "waived" },
  { value: "absorbed", label: "absorbed" },
];
const CURRENCY_OPTIONS: ComboboxOption[] = [{ value: "USD", label: "USD" }];

export function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id ?? "";
  const auth = useAuth();
  const { selectedCompanyId } = useCompanyContext();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseUserDetailTab(searchParams.get("tab"));
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "profile") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  const [showVoided, setShowVoided] = useState(false);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [voidEventId, setVoidEventId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [eventType, setEventType] = useState<DispatcherErrorReason["event_type"] | null>(null);
  const [eventDate, setEventDate] = useState(companyToday());
  const [errorReasonId, setErrorReasonId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<DispatcherErrorReason["severity"]>("warning");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [enableCost, setEnableCost] = useState(false);
  const [costAmount, setCostAmount] = useState("");
  const [costCurrency, setCostCurrency] = useState("USD");
  const [costRecoveryStatus, setCostRecoveryStatus] = useState<DispatcherSafetyEvent["cost_recovery_status"]>(null);
  const [costRecoveredAmount, setCostRecoveredAmount] = useState("");
  const [enableRelated, setEnableRelated] = useState(false);
  const [relatedCustomerId, setRelatedCustomerId] = useState<string | null>(null);
  const [relatedDriverId, setRelatedDriverId] = useState<string | null>(null),
    [relatedLoadId, setRelatedLoadId] = useState<string | null>(null);
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [editDetails, setEditDetails] = useState("");
  const [editRecoveryStatus, setEditRecoveryStatus] = useState<DispatcherSafetyEvent["cost_recovery_status"]>(null);
  const [editRecoveredAmount, setEditRecoveredAmount] = useState("");

  const userDetailQuery = useQuery({
    queryKey: ["user-detail", userId],
    enabled: Boolean(userId),
    queryFn: ({ signal }) => getUserDetail(userId, signal),
  });

  const reasonsQuery = useQuery({
    queryKey: ["dispatcher-error-reasons"],
    queryFn: () => listDispatcherErrorReasons().then((result) => result.reasons),
  });

  // SAF-B29: related-customer must not silent-fetch the full customer list.
  const [customerSearch, setCustomerSearch] = useState("");
  const customersQuery = useQuery({
    queryKey: ["customers", "for-dispatcher-safety", selectedCompanyId, customerSearch],
    enabled: Boolean(selectedCompanyId),
    queryFn: () =>
      listCustomers({
        operating_company_id: selectedCompanyId,
        limit: customerSearch ? 200 : 500,
        search: customerSearch || undefined,
      }).then((result) => result.customers),
  });

  const safetyEventsQuery = useQuery({
    queryKey: ["dispatcher-safety-events", userId, selectedCompanyId, showVoided],
    enabled: Boolean(userId && selectedCompanyId),
    queryFn: () => listDispatcherSafetyEvents(userId, selectedCompanyId!, showVoided).then((result) => result.events),
  });

  const selectedReason = useMemo(
    () => reasonsQuery.data?.find((reason) => reason.id === errorReasonId) ?? null,
    [reasonsQuery.data, errorReasonId]
  );

  const availableReasons = useMemo(() => {
    const reasons = reasonsQuery.data ?? [];
    if (!eventType) return [];
    return reasons.filter((reason) => reason.event_type === eventType);
  }, [eventType, reasonsQuery.data]);

  const reasonOptions = useMemo<ComboboxOption[]>(
    () => availableReasons.map((reason) => ({ value: reason.id, label: reason.label, sublabel: reason.severity })),
    [availableReasons]
  );

  const customerOptions = useMemo<ComboboxOption[]>(
    () =>
      (customersQuery.data ?? []).map((customer) => ({
        value: customer.id,
        label: customer.name,
        sublabel: customer.mc_number ?? customer.dot_number ?? "",
      })),
    [customersQuery.data]
  );

  const costSummary = useMemo(() => {
    const rows = safetyEventsQuery.data ?? [];
    const severeCount = rows.filter((row) => row.severity === "severe").length;
    const totalCost = rows.reduce((acc, row) => acc + Number(row.cost_amount ?? 0), 0);
    const recovered = rows.reduce((acc, row) => acc + Number(row.cost_recovered_amount ?? 0), 0);
    const pending = Math.max(totalCost - recovered, 0);
    return { totalEvents: rows.length, severeCount, totalCost, recovered, pending };
  }, [safetyEventsQuery.data]);

  const isOwner = auth.user?.role === "Owner";
  const canReadSafety = auth.user?.role === "Owner" || auth.user?.role === "Administrator";
  const targetUser = userDetailQuery.data?.user ?? null;
  const defaultCompany = (userDetailQuery.data?.accessible_companies ?? []).find(
    (company) => company.id === targetUser?.default_company_id,
  );
  const canShowSafetyTab = Boolean(
    canReadSafety &&
      targetUser &&
      targetUser.role !== "Owner" &&
      userDetailQuery.data &&
      userDetailQuery.data.has_driver_record === false
  );

  const createEventMutation = useMutation({
    mutationFn: ({ userId: mutationUserId, body }: { userId: string; body: Parameters<typeof createDispatcherSafetyEvent>[1] }) =>
      createDispatcherSafetyEvent(mutationUserId, body),
    onSuccess: () => {
      setAddEventOpen(false);
      setSummary("");
      setDetails("");
      setErrorReasonId(null);
      setEventType(null);
      setEnableCost(false);
      setCostAmount("");
      setCostRecoveryStatus(null);
      setCostRecoveredAmount("");
      setEnableRelated(false);
      setRelatedCustomerId(null);
      setRelatedDriverId(null);
      setRelatedLoadId(null);
      queryClient.invalidateQueries({ queryKey: ["dispatcher-safety-events", userId] });
      pushToast("Safety event created", "success");
    },
  });

  const voidEventMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => voidDispatcherSafetyEvent(userId, id, reason),
    onSuccess: () => {
      setVoidEventId(null);
      setVoidReason("");
      queryClient.invalidateQueries({ queryKey: ["dispatcher-safety-events", userId] });
      pushToast("Event voided", "info");
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: (payload: {
      eventId: string;
      details: string | null;
      cost_recovery_status: DispatcherSafetyEvent["cost_recovery_status"];
      cost_recovered_amount: number | null;
    }) =>
      updateDispatcherSafetyEvent(userId, payload.eventId, {
        details: payload.details,
        cost_recovery_status: payload.cost_recovery_status,
        cost_recovered_amount: payload.cost_recovered_amount,
      }),
    onSuccess: () => {
      setEditEventId(null);
      queryClient.invalidateQueries({ queryKey: ["dispatcher-safety-events", userId] });
      pushToast("Event updated", "success");
    },
  });

  if (userDetailQuery.isLoading) return <div className="p-4 text-sm text-gray-500">Loading user...</div>;
  if (userDetailQuery.isError) {
    return (
      <ListErrorState
        title="Couldn't load user"
        status={userDetailQuery.error instanceof ApiError ? userDetailQuery.error.status : 0}
        message={userDetailQuery.error instanceof Error ? userDetailQuery.error.message : undefined}
        onRetry={() => void userDetailQuery.refetch()}
      />
    );
  }
  if (!targetUser) return <div className="p-4 text-sm text-gray-500">User not found.</div>;

  return (
    <div className="space-y-3">
      <PageHeader
        backHref="/users"
        breadcrumb={["Users"]}
        title={targetUser.email ?? "User detail"}
        subtitle={targetUser.role}
        actions={<StatusBadge status={targetUser.deactivated_at ? "Inactive" : "Active"} />}
      />

      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        <Button variant={tab === "profile" ? "primary" : "secondary"} onClick={() => setTab("profile")}>
          Profile
        </Button>
        <Button variant={tab === "companies" ? "primary" : "secondary"} onClick={() => setTab("companies")}>
          Company Access
        </Button>
        {canShowSafetyTab ? (
          <Button variant={tab === "safety" ? "primary" : "secondary"} onClick={() => setTab("safety")}>
            Safety File
          </Button>
        ) : null}
        <Button variant={tab === "activity" ? "primary" : "secondary"} onClick={() => setTab("activity")}>
          Activity
        </Button>
      </div>

      {selectedCompanyId ? (
        <ComplaintsReverseSection
          operatingCompanyId={selectedCompanyId}
          filter={{ user_id: userId }}
          contextLabel="this employee"
          data-testid="user-complaints-reverse"
        />
      ) : null}

      {tab === "profile" ? (
        <DataPanel title="Profile">
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            <div><span className="text-xs text-gray-500">Email</span><div>{targetUser.email ?? "—"}</div></div>
            <div><span className="text-xs text-gray-500">Role</span><div>{targetUser.role}</div></div>
            <div><span className="text-xs text-gray-500">Status</span><div>{targetUser.deactivated_at ? "Inactive" : "Active"}</div></div>
            <div><span className="text-xs text-gray-500">Created at</span><div>{formatDateTimeUS(targetUser.created_at)}</div></div>
            <div><span className="text-xs text-gray-500">Default company</span><div>{defaultCompany?.short_name ?? defaultCompany?.code ?? entityLabel(null, targetUser.default_company_id, "Company")}</div></div>
            <div><span className="text-xs text-gray-500">Has driver record</span><div>{userDetailQuery.data?.has_driver_record ? "Yes" : "No"}</div></div>
          </div>
        </DataPanel>
      ) : null}

      {tab === "companies" ? (
        <DataPanel title="Company Access">
          <div className="space-y-2 text-sm">
            {(userDetailQuery.data?.accessible_companies ?? []).map((company) => (
              <div key={company.id} className="rounded-sm border border-gray-200 px-2 py-1.5">
                <div className="font-medium">{company.short_name ?? company.code}</div>
                <div className="min-w-0 max-w-full text-xs text-gray-500">
                  <span title={company.legal_name} className="single-line-name">
                    {company.legal_name}
                  </span>{" "}
                  ({company.id === targetUser.default_company_id ? "default" : "accessible"})
                </div>
              </div>
            ))}
            {(userDetailQuery.data?.accessible_companies ?? []).length === 0 ? <div className="text-xs text-gray-500">No explicit company access rows.</div> : null}
          </div>
        </DataPanel>
      ) : null}

      {tab === "safety" && canShowSafetyTab ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-gray-200 bg-white p-3">
            <div>
              <h2 className="text-sm font-semibold">Dispatcher Safety File</h2>
              <p className="text-xs text-gray-500">Permanent accountability record for operational events.</p>
            </div>
            <div className="flex items-center gap-2">
              {isOwner ? (
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={showVoided} onChange={(event) => setShowVoided(event.target.checked)} />
                  Show voided
                </label>
              ) : null}
              {isOwner ? <Button onClick={() => setAddEventOpen(true)}>+ Create Event</Button> : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-sm border border-gray-200 bg-white p-3 text-xs md:grid-cols-5">
            <div>
              <div className="text-gray-500">Total events</div>
              <div className="text-sm font-semibold">{costSummary.totalEvents}</div>
            </div>
            <div>
              <div className="text-gray-500">Severe</div>
              <div className="text-sm font-semibold">{costSummary.severeCount}</div>
            </div>
            <div>
              <div className="text-gray-500">Total cost</div>
              <div className="text-sm font-semibold">{money(costSummary.totalCost)}</div>
            </div>
            <div>
              <div className="text-gray-500">Recovered</div>
              <div className="text-sm font-semibold">{money(costSummary.recovered)}</div>
            </div>
            <div>
              <div className="text-gray-500">Pending recovery</div>
              <div className="text-sm font-semibold">{money(costSummary.pending)}</div>
            </div>
          </div>

          <div className="space-y-2">
            {(safetyEventsQuery.data ?? []).map((event) => (
              <div
                key={event.id}
                className={`rounded-sm border p-3 ${event.voided_at ? "border-gray-300 bg-gray-100 text-gray-500" : "border-gray-200 bg-white"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-sm bg-gray-100 px-2 py-0.5 text-xs">{formatDateUS(event.event_date)}</span>
                    <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs capitalize">{eventTypeLabel(event.event_type)}</span>
                    <StatusBadge status={event.severity} />
                  </div>
                  <div className="font-semibold">{money(event.cost_amount)}</div>
                </div>
                <div className={`mt-1 text-sm ${event.voided_at ? "line-through" : ""}`}>{event.summary}</div>
                <div className="mt-1 text-xs text-gray-500">{event.error_reason_label ?? "No reason assigned"}</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-slate-700 hover:underline"
                    onClick={() => setExpandedEventId((current) => (current === event.id ? null : event.id))}
                  >
                    {expandedEventId === event.id ? "Hide details" : "View details"}
                  </button>
                  {isOwner && !event.voided_at ? (
                    <>
                      <button
                        type="button"
                        className="text-xs text-slate-700 hover:underline"
                        onClick={() => {
                          setEditEventId(event.id);
                          setEditDetails(event.details ?? "");
                          setEditRecoveryStatus(event.cost_recovery_status);
                          setEditRecoveredAmount(event.cost_recovered_amount !== null ? String(event.cost_recovered_amount) : "");
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => setVoidEventId(event.id)}>
                        Void
                      </button>
                    </>
                  ) : null}
                </div>

                {expandedEventId === event.id ? (
                  <div className="mt-2 space-y-1 border-t border-gray-200 pt-2 text-xs">
                    <div>Details: {event.details || "—"}</div>
                    <div>Cost recovery: {event.cost_recovery_status ?? "—"}</div>
                    <div>Recovered amount: {money(event.cost_recovered_amount)}</div>
                    <div>
                      Related:{" "}
                      {event.related_customer_id ? <EntityLink kind="customer" id={event.related_customer_id} label={entityLabel(event.related_customer_name, event.related_customer_id, "Customer")} /> : "Customer —"} |{" "}
                      {event.related_driver_id ? <EntityLink kind="driver" id={event.related_driver_id} label={entityLabel(event.related_driver_name, event.related_driver_id, "Driver")} /> : "Driver —"} | Load:{" "}
                      {event.related_load_id ? <EntityLink kind="load" id={event.related_load_id} label={entityLabel(event.related_load_number, event.related_load_id, "Load")} /> : "—"}
                    </div>
                    {event.voided_at ? (
                      <div className="font-semibold">
                        VOIDED on {formatDateTimeUS(event.voided_at)} by <EntityLink kind="user" id={event.voided_by_user_id} label={entityLabel(event.voided_by_user_email, event.voided_by_user_id, "User")} />:{" "}
                        {event.void_reason}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "activity" && selectedCompanyId ? (
        <UserActivityTab operatingCompanyId={selectedCompanyId} userId={userId} />
      ) : tab === "activity" ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm text-gray-500">Select an operating company to view activity.</div>
      ) : null}

      <Modal variant="drawer" open={addEventOpen} onClose={() => setAddEventOpen(false)} title="Create Dispatcher Safety Event">
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!eventType) {
              pushToast("Event type is required", "error");
              return;
            }
            if (!summary.trim()) {
              pushToast("Summary is required", "error");
              return;
            }
            const requiresReason = eventType !== "commendation" && eventType !== "other";
            if (requiresReason && !errorReasonId) {
              pushToast("Error reason is required for this event type", "error");
              return;
            }

            try {
              await createEventMutation.mutateAsync({
                userId,
                body: {
                  event_type: eventType,
                  event_date: eventDate,
                  severity,
                  summary: summary.trim(),
                  details: details.trim() || undefined,
                  error_reason_id: errorReasonId ?? undefined,
                  cost_amount: enableCost && costAmount ? Number(costAmount) : undefined,
                  cost_currency: enableCost ? costCurrency : undefined,
                  cost_recovery_status: enableCost ? costRecoveryStatus ?? undefined : undefined,
                  cost_recovered_amount: enableCost && costRecoveredAmount ? Number(costRecoveredAmount) : undefined,
                  related_customer_id: enableRelated ? relatedCustomerId ?? undefined : undefined,
                  related_driver_id: enableRelated ? relatedDriverId ?? undefined : undefined,
                  related_load_id: enableRelated ? relatedLoadId ?? undefined : undefined,
                },
              });
            } catch (error) {
              if (error instanceof ApiError) {
                const payload = (error.data ?? {}) as { error?: string };
                pushToast(payload.error ?? "Failed to create event", "error");
                return;
              }
              pushToast("Failed to create event", "error");
            }
          }}
        >
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Event type</label>
            <Combobox
              options={EVENT_TYPE_OPTIONS}
              value={eventType}
              onChange={(value) => {
                const nextType = (value ?? null) as DispatcherErrorReason["event_type"] | null;
                setEventType(nextType);
                setErrorReasonId(null);
                if (nextType === "commendation" || nextType === "other") setSeverity("info");
              }}
              placeholder="Select event type"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Event date</label>
            <DatePicker
              value={eventDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={setEventDate}
              className="w-full h-9"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Error reason</label>
            {/*
              LST-PICKER-01: was a Combobox whose allowAddNew only toasted
              "Add … from dispatcher error reasons catalog" — fake +Add, no write.
              Wire ReferenceSelect → POST catalogs.dispatcher_error_reasons (same table the
              listDispatcherErrorReasons picker reads). event_type comes from the form above.
            */}
            {selectedCompanyId ? (
              <ReferenceSelect
                value={errorReasonId}
                onChange={(value) => {
                  setErrorReasonId(value);
                  const next = availableReasons.find((reason) => reason.id === value);
                  if (next) setSeverity(next.severity);
                }}
                options={reasonOptions.map((o) => ({ value: o.value, label: o.label, type: o.sublabel }))}
                createKind="dispatcher_error_reason"
                operatingCompanyId={selectedCompanyId}
                createdValueField="id"
                createExtras={
                  eventType
                    ? { event_type: eventType, severity }
                    : undefined
                }
                placeholder={eventType ? "Select reason" : "Select event type first"}
                disabled={!eventType}
                loading={reasonsQuery.isLoading}
                onOptionCreated={(opt) => {
                  setErrorReasonId(opt.value);
                  void reasonsQuery.refetch();
                }}
              />
            ) : (
              <Combobox
                options={reasonOptions}
                value={errorReasonId}
                onChange={(value) => {
                  setErrorReasonId(value);
                  const next = availableReasons.find((reason) => reason.id === value);
                  if (next) setSeverity(next.severity);
                }}
                placeholder="Select operating company first"
                disabled
                loading={reasonsQuery.isLoading}
              />
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Severity</label>
            <Combobox
              options={SEVERITY_OPTIONS}
              value={severity}
              onChange={(value) => setSeverity(((value as DispatcherErrorReason["severity"]) ?? "warning"))}
              disabled={Boolean(selectedReason)}
              placeholder="Select severity"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Summary</label>
            <input value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={500} className="w-full rounded-sm border border-gray-300 h-9 px-2 text-[13px]" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Details</label>
            <textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={4} maxLength={5000} className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]" />
          </div>
          <div className="rounded-sm border border-gray-200 p-2">
            <label className="inline-flex items-center gap-2 text-xs">
              <input type="checkbox" checked={enableCost} onChange={(event) => setEnableCost(event.target.checked)} />
              Cost attribution
            </label>
            {enableCost ? (
              <div className="mt-2 space-y-2">
                {/* M-1: dollars-mode QBO money entry; cost_amount = numeric(12,2) DOLLARS, submit Number() byte-for-byte. */}
                <MoneyInput
                  valueDollars={costAmount ? Number(costAmount) : null}
                  onChangeDollars={(d) => setCostAmount(d == null ? "" : String(d))}
                  ariaLabel="Cost amount"
                  placeholder="Cost amount"
                  className="w-full"
                />
                <Combobox
                  options={CURRENCY_OPTIONS}
                  value={costCurrency}
                  onChange={(value) => setCostCurrency(value ?? "USD")}
                  placeholder="Currency"
                />
                <Combobox
                  options={COST_RECOVERY_STATUS_OPTIONS}
                  value={costRecoveryStatus ?? ""}
                  onChange={(value) => setCostRecoveryStatus((value || null) as DispatcherSafetyEvent["cost_recovery_status"])}
                  allowClear
                  placeholder="Select recovery status"
                />
                {costRecoveryStatus === "partial" || costRecoveryStatus === "recovered" ? (
                  <MoneyInput
                    valueDollars={costRecoveredAmount ? Number(costRecoveredAmount) : null}
                    onChangeDollars={(d) => setCostRecoveredAmount(d == null ? "" : String(d))}
                    ariaLabel="Recovered amount"
                    placeholder="Recovered amount"
                    className="w-full"
                  />
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="rounded-sm border border-gray-200 p-2">
            <label className="inline-flex items-center gap-2 text-xs">
              <input type="checkbox" checked={enableRelated} onChange={(event) => setEnableRelated(event.target.checked)} />
              Related entities
            </label>
            {enableRelated ? (
              <div className="mt-2 space-y-2">
                {selectedCompanyId ? (
                  <ReferenceSelect
                    value={relatedCustomerId}
                    onChange={setRelatedCustomerId}
                    options={customerOptions.map((o) => ({ value: o.value, label: o.label, type: o.sublabel }))}
                    createKind="customer"
                    operatingCompanyId={selectedCompanyId}
                    placeholder="Related customer"
                    onSearch={setCustomerSearch}
                    loading={customersQuery.isLoading}
                  />
                ) : (
                  <Combobox options={customerOptions} value={relatedCustomerId} onChange={setRelatedCustomerId} placeholder="Select company first" disabled />
                )}
                {selectedCompanyId ? (
                  <DriverPickerWithCreate
                    operatingCompanyId={selectedCompanyId}
                    value={relatedDriverId}
                    onChange={setRelatedDriverId}
                    open={addEventOpen && enableRelated}
                    placeholder="Related driver"
                    dataField="dispatcher-safety-related-driver"
                  />
                ) : (
                  <Combobox options={[]} value={relatedDriverId} onChange={setRelatedDriverId} placeholder="Select company first" disabled />
                )}
                {selectedCompanyId ? (
                  <EntityPicker
                    kind="load"
                    operatingCompanyId={selectedCompanyId}
                    value={relatedLoadId}
                    onChange={setRelatedLoadId}
                    allowCreate={false}
                    placeholder="Related load"
                  />
                ) : (
                  <Combobox options={[]} value={relatedLoadId} onChange={setRelatedLoadId} placeholder="Select company first" disabled />
                )}
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAddEventOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createEventMutation.isPending}>
              Create Event
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(voidEventId)} onClose={() => setVoidEventId(null)} title="Void Event">
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!voidEventId) return;
            await voidEventMutation.mutateAsync({ id: voidEventId, reason: voidReason });
          }}
        >
          <textarea
            value={voidReason}
            onChange={(event) => setVoidReason(event.target.value)}
            rows={4}
            placeholder="Void reason (min 10 chars)"
            className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setVoidEventId(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={voidEventMutation.isPending} disabled={voidReason.trim().length < 10}>
              Confirm Void
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(editEventId)} onClose={() => setEditEventId(null)} title="Update Event">
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!editEventId) return;
            await updateEventMutation.mutateAsync({
              eventId: editEventId,
              details: editDetails.trim() || null,
              cost_recovery_status: editRecoveryStatus,
              cost_recovered_amount: editRecoveredAmount ? Number(editRecoveredAmount) : null,
            });
          }}
        >
          <textarea
            value={editDetails}
            onChange={(event) => setEditDetails(event.target.value)}
            rows={4}
            className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
            placeholder="Details"
          />
          <Combobox
            options={COST_RECOVERY_STATUS_OPTIONS}
            value={editRecoveryStatus ?? ""}
            onChange={(value) => setEditRecoveryStatus((value || null) as DispatcherSafetyEvent["cost_recovery_status"])}
            allowClear
            placeholder="No recovery status"
          />
          <MoneyInput
            valueDollars={editRecoveredAmount ? Number(editRecoveredAmount) : null}
            onChangeDollars={(d) => setEditRecoveredAmount(d == null ? "" : String(d))}
            ariaLabel="Recovered amount"
            placeholder="Recovered amount"
            className="w-full"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditEventId(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={updateEventMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
