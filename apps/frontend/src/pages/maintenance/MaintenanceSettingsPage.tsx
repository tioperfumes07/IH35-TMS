import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getMaintenanceSettings, updateMaintenanceSettings } from "../../api/maintenance";
import { Button } from "../../components/Button";

type Props = {
  operatingCompanyId: string;
};

export function MaintenanceSettingsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["maintenance", "settings", operatingCompanyId],
    queryFn: () => getMaintenanceSettings(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });
  const settings = settingsQuery.data;

  const [pmIntervalDays, setPmIntervalDays] = useState("30");
  const [defaultShopLocation, setDefaultShopLocation] = useState("Main yard");
  const [bayAssignmentPolicy, setBayAssignmentPolicy] = useState("Auto-assign by first available bay");
  const [notificationEmailEnabled, setNotificationEmailEnabled] = useState(true);
  const hydratedRef = useRef(false);

  useEffect(() => {
    hydratedRef.current = false;
  }, [operatingCompanyId]);

  useEffect(() => {
    if (!settings || hydratedRef.current) return;
    hydratedRef.current = true;
    setPmIntervalDays(String(settings.pm_interval_days_default ?? 30));
    setDefaultShopLocation(String(settings.default_shop_location ?? "Main yard"));
    setBayAssignmentPolicy(String(settings.bay_assignment_policy ?? "Auto-assign by first available bay"));
    setNotificationEmailEnabled(Boolean(settings.notification_email_enabled));
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateMaintenanceSettings(operatingCompanyId, {
        pm_interval_days_default: Number(pmIntervalDays),
        default_shop_location: defaultShopLocation.trim(),
        bay_assignment_policy: bayAssignmentPolicy.trim(),
        notification_email_enabled: notificationEmailEnabled,
      }),
    onSuccess: async () => {
      hydratedRef.current = false;
      await queryClient.invalidateQueries({ queryKey: ["maintenance", "settings", operatingCompanyId] });
    },
  });

  return (
    <form
      className="space-y-2 rounded-sm border border-gray-200 bg-white p-3"
      data-testid="maintenance-settings-page"
      onSubmit={(event) => {
        event.preventDefault();
        saveMutation.mutate();
      }}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="rounded-sm border border-gray-200 p-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">PM Intervals</h3>
          <label className="mt-2 block text-xs text-gray-600" htmlFor="maint-settings-pm-interval">
            Default PM interval (days)
          </label>
          <input
            id="maint-settings-pm-interval"
            data-testid="maintenance-settings-pm-interval"
            className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-sm"
            type="number"
            min={1}
            max={365}
            value={pmIntervalDays}
            onChange={(event) => setPmIntervalDays(event.target.value)}
          />
        </section>

        <section className="rounded-sm border border-gray-200 p-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Vendor Defaults</h3>
          <label className="mt-2 block text-xs text-gray-600">Maintenance vendors available</label>
          <input
            className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-sm"
            value={String(settings?.maintenance_vendors ?? 0)}
            readOnly
          />
          <label className="mt-2 block text-xs text-gray-600" htmlFor="maint-settings-shop-location">
            Default shop location
          </label>
          <input
            id="maint-settings-shop-location"
            data-testid="maintenance-settings-shop-location"
            className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-sm"
            value={defaultShopLocation}
            onChange={(event) => setDefaultShopLocation(event.target.value)}
          />
        </section>

        <section className="rounded-sm border border-gray-200 p-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Bay Assignments</h3>
          <label className="mt-2 block text-xs text-gray-600" htmlFor="maint-settings-bay-policy">
            Bay assignment policy
          </label>
          <input
            id="maint-settings-bay-policy"
            data-testid="maintenance-settings-bay-policy"
            className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-sm"
            value={bayAssignmentPolicy}
            onChange={(event) => setBayAssignmentPolicy(event.target.value)}
          />
        </section>

        <section className="rounded-sm border border-gray-200 p-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Notifications</h3>
          <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              data-testid="maintenance-settings-email-enabled"
              checked={notificationEmailEnabled}
              onChange={(event) => setNotificationEmailEnabled(event.target.checked)}
            />
            Email notifications enabled
          </label>
          <label className="mt-2 block text-xs text-gray-600">PM schedules tracked</label>
          <input
            className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-sm"
            value={String(settings?.pm_schedules ?? 0)}
            readOnly
          />
        </section>
      </div>

      <div className="flex items-center justify-end gap-2">
        {saveMutation.isError ? (
          <span className="text-xs text-red-600">Save failed — settings store may not be provisioned yet.</span>
        ) : null}
        <Button type="submit" loading={saveMutation.isPending} data-testid="maintenance-settings-save">
          Save
        </Button>
      </div>
    </form>
  );
}
