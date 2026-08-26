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
  const saveGenerationRef = useRef(0);

  useEffect(() => {
    hydratedRef.current = false;
    saveGenerationRef.current += 1;
    saveMutation.reset();
    setPmIntervalDays("30");
    setDefaultShopLocation("Main yard");
    setBayAssignmentPolicy("Auto-assign by first available bay");
    setNotificationEmailEnabled(true);
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
    mutationFn: (input: {
      companyId: string;
      generation: number;
      payload: {
        pm_interval_days_default: number;
        default_shop_location: string;
        bay_assignment_policy: string;
        notification_email_enabled: boolean;
      };
    }) => updateMaintenanceSettings(input.companyId, input.payload),
    onSuccess: async (_result, input) => {
      if (input.generation !== saveGenerationRef.current) return;
      hydratedRef.current = false;
      await queryClient.invalidateQueries({ queryKey: ["maintenance", "settings", input.companyId] });
    },
  });

  const saveSettings = () => {
    saveMutation.mutate({
      companyId: operatingCompanyId,
      generation: saveGenerationRef.current,
      payload: {
        pm_interval_days_default: Number(pmIntervalDays),
        default_shop_location: defaultShopLocation.trim(),
        bay_assignment_policy: bayAssignmentPolicy.trim(),
        notification_email_enabled: notificationEmailEnabled,
      },
    });
  };

  return (
    <form
      className="space-y-3"
      data-testid="maintenance-settings-page"
      onSubmit={(event) => {
        event.preventDefault();
        saveSettings();
      }}
    >
      {settingsQuery.isLoading ? (
        <p className="text-xs text-slate-500" data-testid="maintenance-settings-loading">
          Loading maintenance settings…
        </p>
      ) : null}
      {settingsQuery.isError ? (
        <p className="rounded-sm border border-slate-300 bg-slate-50 p-3 text-xs text-slate-700" role="alert">
          Maintenance settings failed to load for this entity — this is not an empty configuration.
        </p>
      ) : null}
      {!settingsQuery.isLoading && !settingsQuery.isError && !settings ? (
        <p className="text-xs text-slate-500">
          No maintenance settings row yet for this entity — save defaults below to create one.
        </p>
      ) : null}
      <section className="overflow-hidden rounded-sm border border-slate-300 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Maintenance settings</h2>
        </div>
        <div className="grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="px-3 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">PM Intervals</h3>
            <label className="mt-2 block text-xs text-slate-600" htmlFor="maint-settings-pm-interval">
              Default PM interval (days)
            </label>
            <input
              id="maint-settings-pm-interval"
              data-testid="maintenance-settings-pm-interval"
              className="mt-1 h-8 w-full rounded-sm border border-slate-300 px-2 text-sm text-slate-900"
              type="number"
              min={1}
              max={365}
              value={pmIntervalDays}
              onChange={(event) => setPmIntervalDays(event.target.value)}
            />
          </div>

          <div className="px-3 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Vendor Defaults</h3>
            <label className="mt-2 block text-xs text-slate-600">Maintenance vendors available</label>
            <input
              className="mt-1 h-8 w-full rounded-sm border border-slate-300 px-2 text-sm text-slate-900"
              value={String(settings?.maintenance_vendors ?? 0)}
              readOnly
            />
            <label className="mt-2 block text-xs text-slate-600" htmlFor="maint-settings-shop-location">
              Default shop location
            </label>
            <input
              id="maint-settings-shop-location"
              data-testid="maintenance-settings-shop-location"
              className="mt-1 h-8 w-full rounded-sm border border-slate-300 px-2 text-sm text-slate-900"
              value={defaultShopLocation}
              onChange={(event) => setDefaultShopLocation(event.target.value)}
            />
          </div>

          <div className="border-t border-slate-200 px-3 py-3 md:border-t-0">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Bay Assignments</h3>
            <label className="mt-2 block text-xs text-slate-600" htmlFor="maint-settings-bay-policy">
              Bay assignment policy
            </label>
            <input
              id="maint-settings-bay-policy"
              data-testid="maintenance-settings-bay-policy"
              className="mt-1 h-8 w-full rounded-sm border border-slate-300 px-2 text-sm text-slate-900"
              value={bayAssignmentPolicy}
              onChange={(event) => setBayAssignmentPolicy(event.target.value)}
            />
          </div>

          <div className="border-t border-slate-200 px-3 py-3 md:border-t-0">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Notifications</h3>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                data-testid="maintenance-settings-email-enabled"
                checked={notificationEmailEnabled}
                onChange={(event) => setNotificationEmailEnabled(event.target.checked)}
              />
              Email notifications enabled
            </label>
            <label className="mt-2 block text-xs text-slate-600">PM schedules tracked</label>
            <input
              className="mt-1 h-8 w-full rounded-sm border border-slate-300 px-2 text-sm text-slate-900"
              value={String(settings?.pm_schedules ?? 0)}
              readOnly
            />
          </div>
        </div>
      </section>

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
