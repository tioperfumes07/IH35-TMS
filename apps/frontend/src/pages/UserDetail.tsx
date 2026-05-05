import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
import { listCustomers, listDrivers } from "../api/mdata";
import { Button } from "../components/Button";
import { Combobox, type ComboboxOption } from "../components/Combobox";
import { DataPanel } from "../components/layout/DataPanel";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { useAuth } from "../auth/useAuth";

type Tab = "profile" | "companies" | "safety" | "activity";

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

export function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id ?? "";
  const auth = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("profile");
  const [showVoided, setShowVoided] = useState(false);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [voidEventId, setVoidEventId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [eventType, setEventType] = useState<DispatcherErrorReason["event_type"] | null>(null);
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
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
  const [relatedDriverId, setRelatedDriverId] = useState<string | null>(null);
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [editDetails, setEditDetails] = useState("");
  const [editRecoveryStatus, setEditRecoveryStatus] = useState<DispatcherSafetyEvent["cost_recovery_status"]>(null);
  const [editRecoveredAmount, setEditRecoveredAmount] = useState("");

  const userDetailQuery = useQuery({
    queryKey: ["user-detail", userId],
    enabled: Boolean(userId),
    queryFn: () => getUserDetail(userId),
  });

  const reasonsQuery = useQuery({
    queryKey: ["dispatcher-error-reasons"],
    queryFn: () => listDispatcherErrorReasons().then((result) => result.reasons),
  });

  const customersQuery = useQuery({
    queryKey: ["customers", "for-dispatcher-safety"],
    queryFn: () => listCustomers().then((result) => result.customers),
  });

  const driversQuery = useQuery({
    queryKey: ["drivers", "for-dispatcher-safety"],
    queryFn: () => listDrivers({}).then((result) => result.drivers),
  });

  const safetyEventsQuery = useQuery({
    queryKey: ["dispatcher-safety-events", userId, showVoided],
    enabled: Boolean(userId),
    queryFn: () => listDispatcherSafetyEvents(userId, showVoided).then((result) => result.events),
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

  const driverOptions = useMemo<ComboboxOption[]>(
    () =>
      (driversQuery.data ?? []).map((driver) => ({
        value: driver.id,
        label: `${driver.first_name} ${driver.last_name}`,
        sublabel: driver.cdl_number ?? "",
      })),
    [driversQuery.data]
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
  if (!targetUser) return <div className="p-4 text-sm text-gray-500">User not found.</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{targetUser.email ?? "User detail"}</h1>
          <p className="text-xs text-gray-500">{targetUser.role}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={targetUser.deactivated_at ? "Inactive" : "Active"} />
          <Link to="/users" className="text-xs text-sky-700 hover:underline">
            Back to users
          </Link>
        </div>
      </div>

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

      {tab === "profile" ? (
        <DataPanel title="Profile">
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            <div><span className="text-xs text-gray-500">Email</span><div>{targetUser.email ?? "—"}</div></div>
            <div><span className="text-xs text-gray-500">Role</span><div>{targetUser.role}</div></div>
            <div><span className="text-xs text-gray-500">Status</span><div>{targetUser.deactivated_at ? "Inactive" : "Active"}</div></div>
            <div><span className="text-xs text-gray-500">Created at</span><div>{new Date(targetUser.created_at).toLocaleString()}</div></div>
            <div><span className="text-xs text-gray-500">Default company</span><div>{targetUser.default_company_id ?? "—"}</div></div>
            <div><span className="text-xs text-gray-500">Has driver record</span><div>{userDetailQuery.data?.has_driver_record ? "Yes" : "No"}</div></div>
          </div>
        </DataPanel>
      ) : null}

      {tab === "companies" ? (
        <DataPanel title="Company Access">
          <div className="space-y-2 text-sm">
            {(userDetailQuery.data?.accessible_companies ?? []).map((company) => (
              <div key={company.id} className="rounded border border-gray-200 px-2 py-1.5">
                <div className="font-medium">{company.short_name ?? company.code}</div>
                <div className="text-xs text-gray-500">
                  {company.legal_name} ({company.id === targetUser.default_company_id ? "default" : "accessible"})
                </div>
              </div>
            ))}
            {(userDetailQuery.data?.accessible_companies ?? []).length === 0 ? <div className="text-xs text-gray-500">No explicit company access rows.</div> : null}
          </div>
        </DataPanel>
      ) : null}

      {tab === "safety" && canShowSafetyTab ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-200 bg-white p-3">
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
              {isOwner ? <Button onClick={() => setAddEventOpen(true)}>+ Add Event</Button> : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded border border-gray-200 bg-white p-3 text-xs md:grid-cols-5">
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
                className={`rounded border p-3 ${event.voided_at ? "border-gray-300 bg-gray-100 text-gray-500" : "border-gray-200 bg-white"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{event.event_date}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs capitalize">{eventTypeLabel(event.event_type)}</span>
                    <StatusBadge status={event.severity} />
                  </div>
                  <div className="font-semibold">{money(event.cost_amount)}</div>
                </div>
                <div className={`mt-1 text-sm ${event.voided_at ? "line-through" : ""}`}>{event.summary}</div>
                <div className="mt-1 text-xs text-gray-500">{event.error_reason_label ?? "No reason assigned"}</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-sky-700 hover:underline"
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
                      {event.related_customer_id ? <Link to={`/customers/${event.related_customer_id}`} className="text-sky-700">Customer</Link> : "Customer —"} |{" "}
                      {event.related_driver_id ? <Link to={`/drivers/${event.related_driver_id}`} className="text-sky-700">Driver</Link> : "Driver —"} | Load:{" "}
                      {event.related_load_id ?? "Phase 3 placeholder"}
                    </div>
                    {event.voided_at ? (
                      <div className="font-semibold">
                        VOIDED on {new Date(event.voided_at).toLocaleString()} by {event.voided_by_user_email ?? event.voided_by_user_id}:{" "}
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

      {tab === "activity" ? <div className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-500">Audit history coming in Phase 6.</div> : null}

      <Modal open={addEventOpen} onClose={() => setAddEventOpen(false)} title="Add Dispatcher Safety Event">
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
            <input
              type="date"
              value={eventDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(event) => setEventDate(event.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Error reason</label>
            <Combobox
              options={reasonOptions}
              value={errorReasonId}
              onChange={(value) => {
                setErrorReasonId(value);
                const next = availableReasons.find((reason) => reason.id === value);
                if (next) setSeverity(next.severity);
              }}
              placeholder="Select reason"
              disabled={!eventType}
              loading={reasonsQuery.isLoading}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Severity</label>
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value as DispatcherErrorReason["severity"])}
              className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
              disabled={Boolean(selectedReason)}
            >
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="severe">severe</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Summary</label>
            <input value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={500} className="w-full rounded border border-gray-300 px-2 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Details</label>
            <textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={4} maxLength={5000} className="w-full rounded border border-gray-300 px-2 py-2 text-sm" />
          </div>
          <div className="rounded border border-gray-200 p-2">
            <label className="inline-flex items-center gap-2 text-xs">
              <input type="checkbox" checked={enableCost} onChange={(event) => setEnableCost(event.target.checked)} />
              Cost attribution
            </label>
            {enableCost ? (
              <div className="mt-2 space-y-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costAmount}
                  onChange={(event) => setCostAmount(event.target.value)}
                  placeholder="Cost amount"
                  className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
                />
                <select value={costCurrency} onChange={(event) => setCostCurrency(event.target.value)} className="w-full rounded border border-gray-300 px-2 py-2 text-sm">
                  <option value="USD">USD</option>
                </select>
                <select
                  value={costRecoveryStatus ?? ""}
                  onChange={(event) => setCostRecoveryStatus((event.target.value || null) as DispatcherSafetyEvent["cost_recovery_status"])}
                  className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
                >
                  <option value="">Select recovery status</option>
                  <option value="pending">pending</option>
                  <option value="partial">partial</option>
                  <option value="recovered">recovered</option>
                  <option value="waived">waived</option>
                  <option value="absorbed">absorbed</option>
                </select>
                {costRecoveryStatus === "partial" || costRecoveryStatus === "recovered" ? (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={costRecoveredAmount}
                    onChange={(event) => setCostRecoveredAmount(event.target.value)}
                    placeholder="Recovered amount"
                    className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
                  />
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="rounded border border-gray-200 p-2">
            <label className="inline-flex items-center gap-2 text-xs">
              <input type="checkbox" checked={enableRelated} onChange={(event) => setEnableRelated(event.target.checked)} />
              Related entities
            </label>
            {enableRelated ? (
              <div className="mt-2 space-y-2">
                <Combobox options={customerOptions} value={relatedCustomerId} onChange={setRelatedCustomerId} placeholder="Related customer" loading={customersQuery.isLoading} />
                <Combobox options={driverOptions} value={relatedDriverId} onChange={setRelatedDriverId} placeholder="Related driver" loading={driversQuery.isLoading} />
                <div className="text-xs text-gray-500">Related load: Phase 3 placeholder when loads module exists.</div>
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
            className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
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
            className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
            placeholder="Details"
          />
          <select
            value={editRecoveryStatus ?? ""}
            onChange={(event) => setEditRecoveryStatus((event.target.value || null) as DispatcherSafetyEvent["cost_recovery_status"])}
            className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
          >
            <option value="">No recovery status</option>
            <option value="pending">pending</option>
            <option value="partial">partial</option>
            <option value="recovered">recovered</option>
            <option value="waived">waived</option>
            <option value="absorbed">absorbed</option>
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            value={editRecoveredAmount}
            onChange={(event) => setEditRecoveredAmount(event.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
            placeholder="Recovered amount"
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
