import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";

type Props = {
  operatingCompanyId: string;
};

export function MaintenanceSettingsPage({ operatingCompanyId }: Props) {
  const settingsQuery = useQuery({
    queryKey: ["maintenance", "settings", operatingCompanyId],
    queryFn: () =>
      apiRequest<{
        pm_interval_days_default: number;
        notification_email_enabled: boolean;
        default_shop_location: string;
        pm_schedules: number;
        maintenance_vendors: number;
      }>(`/api/v1/maintenance/settings?operating_company_id=${encodeURIComponent(operatingCompanyId)}`),
    enabled: Boolean(operatingCompanyId),
  });
  const settings = settingsQuery.data;

  return (
    <div className="space-y-2 rounded border border-gray-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="rounded border border-gray-200 p-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">PM Intervals</h3>
          <label className="mt-2 block text-xs text-gray-600">Default PM interval (days)</label>
          <input className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-sm" value={String(settings?.pm_interval_days_default ?? 30)} readOnly />
          <div className="mt-1 text-[11px] text-gray-500">View-only settings.</div>
        </section>

        <section className="rounded border border-gray-200 p-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Vendor Defaults</h3>
          <label className="mt-2 block text-xs text-gray-600">Maintenance vendors available</label>
          <input className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-sm" value={String(settings?.maintenance_vendors ?? 0)} readOnly />
          <label className="mt-2 block text-xs text-gray-600">Default shop location</label>
          <input className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-sm" value={String(settings?.default_shop_location ?? "Main yard")} readOnly />
        </section>

        <section className="rounded border border-gray-200 p-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Bay Assignments</h3>
          <label className="mt-2 block text-xs text-gray-600">Bay assignment policy</label>
          <input className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-sm" value="Auto-assign by first available bay" readOnly />
        </section>

        <section className="rounded border border-gray-200 p-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Notifications</h3>
          <label className="mt-2 block text-xs text-gray-600">Email notifications enabled</label>
          <input className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-sm" value={settings?.notification_email_enabled ? "Yes" : "No"} readOnly />
          <label className="mt-2 block text-xs text-gray-600">PM schedules tracked</label>
          <input className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-sm" value={String(settings?.pm_schedules ?? 0)} readOnly />
        </section>
      </div>

      <div className="flex justify-end">
        <button type="button" className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">
          Save
        </button>
      </div>
    </div>
  );
}
