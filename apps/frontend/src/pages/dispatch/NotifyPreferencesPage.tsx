import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getCustomerNotifyLog,
  getCustomerNotifyPreferences,
  syncCustomerNotify,
  updateCustomerNotifyPreferences,
  type CustomerNotifyLogEntry,
  type CustomerNotifyPreferences,
} from "../../api/dispatch";
import { listCustomers } from "../../api/mdata";
import { PageHeader } from "../../components/layout/PageHeader";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { CappedListNotice } from "../../components/CappedListNotice";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";

function PrefToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// Migrated to the shared QBO-parity grid — columns, order, and the row testid preserved verbatim
// (§7 additive-only).
const LOG_COLUMNS: Array<ParityColumn<CustomerNotifyLogEntry>> = [
  {
    key: "load_number",
    label: "Load",
    sortable: true,
    render: (entry) => <EntityLink kind="load" id={entry.load_id} label={entityLabel(entry.load_number, entry.load_id, "Load")} />,
  },
  {
    key: "customer_name",
    label: "Customer",
    sortable: true,
    render: (entry) => (
      <EntityLink
        kind="customer"
        id={entry.customer_id}
        label={entityLabel(entry.customer_name, entry.customer_id, "Customer")}
      />
    ),
  },
  {
    key: "milestone_type",
    label: "Milestone",
    sortable: true,
    render: (entry) => <span className="capitalize">{entry.milestone_type.replace(/_/g, " ")}</span>,
  },
  { key: "channel", label: "Channel", sortable: true, render: (entry) => <span className="uppercase">{entry.channel}</span> },
  { key: "status", label: "Status", sortable: true },
  {
    key: "provider_id",
    label: "Provider ID",
    render: (entry) => <span className="font-mono text-xs">{entry.provider_id ?? "—"}</span>,
  },
  {
    key: "sent_at",
    label: "Sent",
    sortable: true,
    render: (entry) => (entry.sent_at ? new Date(entry.sent_at).toLocaleString() : "—"),
  },
];

// CLS-LIST-ERROR-STATE-UNGUARDED. LogTable owns no query — the page does — so it could not know a
// fetch had failed and rendered "No delivery confirmations logged yet." instead. On a customer-notify
// log that is a claim the carrier never notified anyone, when the truth is that we could not ask.
// The contract is extended the same way `loading` already is: the query's owner passes the outcome
// down. onRetry is REQUIRED, not optional — an error state you cannot retry is a dead end.
function LogTable({
  entries,
  loading,
  isError = false,
  onRetry,
}: {
  entries: CustomerNotifyLogEntry[];
  loading?: boolean;
  isError?: boolean;
  onRetry: () => void;
}) {
  if (isError) {
    return (
      <ListErrorState
        title="Couldn't load the notification log"
        status={0}
        message={undefined}
        onRetry={onRetry}
      />
    );
  }
  return (
    <ParityTable<CustomerNotifyLogEntry>
      columns={LOG_COLUMNS}
      rows={entries}
      rowKey={(entry) => entry.id}
      loading={loading}
      emptyText="No delivery confirmations logged yet."
      storageKey="dispatch-notify-log"
      exportFilename="customer-notify-log"
      rowTestId={(entry) => `notify-log-${entry.id}`}
    />
  );
}

export function NotifyPreferencesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const initialCustomerId = useSearchParams()[0].get("customer_id") ?? "";
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [customerSearch, setCustomerSearch] = useState("");

  const customersQuery = useQuery({
    queryKey: ["customers-list-notify", companyId, customerSearch],
    queryFn: () =>
      listCustomers({
        operating_company_id: companyId,
        limit: 5000,
        search: customerSearch || undefined,
      }),
    enabled: Boolean(companyId),
  });

  const prefsQuery = useQuery({
    queryKey: ["customer-notify-prefs", companyId, customerId],
    queryFn: () => getCustomerNotifyPreferences(customerId, companyId),
    enabled: Boolean(companyId && customerId),
  });

  const logQuery = useQuery({
    queryKey: ["customer-notify-log", companyId, customerId],
    queryFn: () => getCustomerNotifyLog(companyId, customerId || undefined),
    enabled: Boolean(companyId),
  });

  const saveM = useMutation({
    mutationFn: (patch: Partial<Omit<CustomerNotifyPreferences, "customer_id">>) =>
      updateCustomerNotifyPreferences(customerId, { operating_company_id: companyId, ...patch }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-notify-prefs", companyId, customerId] });
    },
    onError: (error) => {
      // Previously silent: a failed toggle looked like it saved. Surface the error and refetch so the
      // toggle reverts to the true persisted state.
      pushToast(userFacingApiError(error, "Could not save notification preference"), "error");
      queryClient.invalidateQueries({ queryKey: ["customer-notify-prefs", companyId, customerId] });
    },
  });

  const syncM = useMutation({
    mutationFn: () => syncCustomerNotify(companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-notify-log", companyId] });
    },
    onError: (error) => {
      pushToast(userFacingApiError(error, "Notification sync failed"), "error");
    },
  });

  const prefs = prefsQuery.data?.preferences;
  const customerOptions = useMemo(
    () =>
      (customersQuery.data?.customers ?? []).map((c) => ({
        value: c.id,
        label: entityLabel(c.name, c.id, "Customer"),
        type: c.customer_code ?? c.customer_type ?? "Customer",
      })),
    [customersQuery.data?.customers]
  );

  return (
    <div className="p-4" data-testid="dispatch-notify-preferences-page">
      <PageHeader
        title="Customer ETA notify"
        subtitle="SMS/email milestone alerts with delivery confirmations (B21-D9)"
      />

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          Customer
          {/* CLS-CUST-BARE-SELECT: EntityPicker has no customer kind — ReferenceSelect createKind=customer. */}
          <div className="mt-1 w-80" data-testid="notify-customer-select">
            <ReferenceSelect
              value={customerId || null}
              onChange={(next) => setCustomerId(next ?? "")}
              options={customerOptions}
              createKind="customer"
              operatingCompanyId={companyId}
              placeholder="Select customer"
              disabled={!companyId}
              loading={customersQuery.isLoading}
              onSearch={setCustomerSearch}
            />
            {/* CLS-SILENT-CAP: notify prefs customer picker caps at 5000; surfacing truncation so a customer past the cap is not silently missing. */}
            <CappedListNotice
              shown={customerOptions.length}
              limit={5000}
              total={customersQuery.data?.total ?? null}
              hint="Type to search for a customer that is not listed."
              className="text-[11px] text-slate-600"
            />
          </div>
        </label>
        <button
          type="button"
          className="rounded-sm bg-[#1F2A44] px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={!companyId || syncM.isPending}
          onClick={() => syncM.mutate()}
          data-testid="notify-sync-button"
        >
          Sync milestone sends
        </button>
      </div>

      {customerId && prefs ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-sm border p-4" data-testid="notify-preferences-panel">
            <h2 className="mb-3 font-semibold">Notify preferences</h2>
            <div className="space-y-2">
              <PrefToggle label="Opt in to customer ETA alerts" checked={prefs.opt_in} onChange={(v) => saveM.mutate({ opt_in: v })} />
              <PrefToggle label="Email channel" checked={prefs.notify_email} disabled={!prefs.opt_in} onChange={(v) => saveM.mutate({ notify_email: v })} />
              <PrefToggle label="SMS channel" checked={prefs.notify_sms} disabled={!prefs.opt_in} onChange={(v) => saveM.mutate({ notify_sms: v })} />
              <PrefToggle label="Departed" checked={prefs.notify_on_departed} disabled={!prefs.opt_in} onChange={(v) => saveM.mutate({ notify_on_departed: v })} />
              <PrefToggle label="Arrived" checked={prefs.notify_on_arrived} disabled={!prefs.opt_in} onChange={(v) => saveM.mutate({ notify_on_arrived: v })} />
              <PrefToggle label="Near arrival" checked={prefs.notify_on_near_arrival} disabled={!prefs.opt_in} onChange={(v) => saveM.mutate({ notify_on_near_arrival: v })} />
              <PrefToggle label="Delayed" checked={prefs.notify_on_delayed} disabled={!prefs.opt_in} onChange={(v) => saveM.mutate({ notify_on_delayed: v })} />
            </div>
          </div>
          <div className="rounded-sm border p-4 text-sm text-slate-600">
            <p>Milestone events trigger template-based SMS (Twilio) and email (Resend) when opted in.</p>
            <p className="mt-2">Portal milestone templates are the starting point; near-arrival and delayed use dedicated templates.</p>
          </div>
        </div>
      ) : null}

      <div className="mt-8">
        <h2 className="mb-3 font-semibold">Delivery log</h2>
        <LogTable
          entries={logQuery.data?.entries ?? []}
          loading={logQuery.isLoading}
          isError={logQuery.isError}
          onRetry={() => void logQuery.refetch()}
        />
      </div>
    </div>
  );
}
