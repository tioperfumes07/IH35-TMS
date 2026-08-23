import { useQuery } from "@tanstack/react-query";
import { ListErrorState } from "../ListErrorState";
import { EntityLink } from "../shared/EntityLink";
import { getCustomerNotifyLog, getCustomerNotifyPreferences } from "../../api/dispatch";

export function CustomerNotifyReverseSection({ operatingCompanyId, customerId }: { operatingCompanyId: string; customerId: string }) {
  const preferences = useQuery({
    queryKey: ["dispatch", "reverse", "customer-notify-preferences", operatingCompanyId, customerId],
    queryFn: () => getCustomerNotifyPreferences(customerId, operatingCompanyId),
    enabled: Boolean(operatingCompanyId && customerId),
  });
  const log = useQuery({
    queryKey: ["dispatch", "reverse", "customer-notify-log", operatingCompanyId, customerId],
    queryFn: () => getCustomerNotifyLog(operatingCompanyId, customerId),
    enabled: Boolean(operatingCompanyId && customerId),
  });
  const prefs = preferences.data?.preferences;
  const entries = log.data?.entries ?? [];
  return <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="customer-notify-reverse">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-slate-900">ETA Notifications</h3>
      <EntityLink kind="customer_notify_preferences" id={customerId} label="Manage Notifications" className="text-xs font-semibold text-slate-700 underline" />
    </div>
    {preferences.isLoading || log.isLoading ? <p className="text-sm text-gray-500">Loading notification settings…</p> : null}
    {preferences.isError ? <ListErrorState status={0} message="Could not load notification preferences for this customer." onRetry={() => void preferences.refetch()} /> : null}
    {log.isError ? <ListErrorState status={0} message="Could not load notification history for this customer." onRetry={() => void log.refetch()} /> : null}
    {!preferences.isLoading && !log.isLoading && !preferences.isError && !log.isError ? <div className="text-xs text-slate-700">
      <p>{prefs?.opt_in ? `Enabled · ${prefs.notify_email ? "Email" : ""}${prefs.notify_email && prefs.notify_sms ? " + " : ""}${prefs.notify_sms ? "SMS" : ""}` : "Notifications are not enabled."}</p>
      <p className="text-gray-500">{entries.length ? `${entries.length} recent delivery confirmation${entries.length === 1 ? "" : "s"}.` : "No delivery confirmations logged yet."}</p>
    </div> : null}
  </section>;
}
