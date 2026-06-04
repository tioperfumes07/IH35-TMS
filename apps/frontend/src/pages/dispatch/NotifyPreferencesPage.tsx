import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { useCompanyContext } from "../../contexts/CompanyContext";

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

function LogTable({ entries }: { entries: CustomerNotifyLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-600">No delivery confirmations logged yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded border">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left">
          <tr>
            <th className="px-3 py-2">Load</th>
            <th className="px-3 py-2">Customer</th>
            <th className="px-3 py-2">Milestone</th>
            <th className="px-3 py-2">Channel</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Provider ID</th>
            <th className="px-3 py-2">Sent</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-t" data-testid={`notify-log-${entry.id}`}>
              <td className="px-3 py-2">{entry.load_number ?? entry.load_id}</td>
              <td className="px-3 py-2">{entry.customer_name ?? "—"}</td>
              <td className="px-3 py-2 capitalize">{entry.milestone_type.replace(/_/g, " ")}</td>
              <td className="px-3 py-2 uppercase">{entry.channel}</td>
              <td className="px-3 py-2">{entry.status}</td>
              <td className="px-3 py-2 font-mono text-xs">{entry.provider_id ?? "—"}</td>
              <td className="px-3 py-2">{entry.sent_at ? new Date(entry.sent_at).toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NotifyPreferencesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState("");

  const customersQuery = useQuery({
    queryKey: ["customers-list-notify", companyId],
    queryFn: () => listCustomers({ operating_company_id: companyId }),
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
  });

  const syncM = useMutation({
    mutationFn: () => syncCustomerNotify(companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-notify-log", companyId] });
    },
  });

  const prefs = prefsQuery.data?.preferences;
  const customers = useMemo(() => customersQuery.data?.customers ?? [], [customersQuery.data]);

  return (
    <div className="p-4" data-testid="dispatch-notify-preferences-page">
      <PageHeader
        title="Customer ETA notify"
        subtitle="SMS/email milestone alerts with delivery confirmations (B21-D9)"
      />

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Customer
          <select
            className="ml-2 rounded border px-2 py-1"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            data-testid="notify-customer-select"
          >
            <option value="">Select customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.customer_name ?? c.id}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded bg-sky-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={!companyId || syncM.isPending}
          onClick={() => syncM.mutate()}
          data-testid="notify-sync-button"
        >
          Sync milestone sends
        </button>
      </div>

      {customerId && prefs ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded border p-4" data-testid="notify-preferences-panel">
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
          <div className="rounded border p-4 text-sm text-slate-600">
            <p>Milestone events trigger template-based SMS (Twilio) and email (Resend) when opted in.</p>
            <p className="mt-2">Portal milestone templates are the starting point; near-arrival and delayed use dedicated templates.</p>
          </div>
        </div>
      ) : null}

      <div className="mt-8">
        <h2 className="mb-3 font-semibold">Delivery log</h2>
        <LogTable entries={logQuery.data?.entries ?? []} />
      </div>
    </div>
  );
}
