import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { listDriverLoads, type DriverLoad } from "../../api/driver";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorState } from "../../components/ListErrorState";

export function DriverLoadsPage() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["driver", "loads"], queryFn: listDriverLoads });

  if (q.isLoading) return <p className="text-sm text-gray-600">…</p>;
  if (q.isError) {
    return (
      <ListErrorState
        title="Couldn't load assigned loads"
        status={0}
        message={q.error instanceof Error ? q.error.message : undefined}
        onRetry={() => void q.refetch()}
      />
    );
  }
  const loads = q.data ?? [];
  if (loads.length === 0) return <p className="text-sm text-gray-700">{t("driver.no_loads")}</p>;

  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold">{t("driver.loads_title")}</h2>
      <ul className="space-y-2">
        {loads.map((load: DriverLoad) => (
          <li key={load.id} className="rounded-sm border border-slate-200 bg-white p-3">
            <EntityLink
              kind="driver_app_load"
              id={load.id}
              label={entityLabel(load.display_id, load.id, "Load")}
              className="font-medium text-slate-900"
            />
            <p className="text-xs text-slate-600">
              <EntityLink
                kind="customer"
                id={load.customer_id}
                label={entityLabel(load.customer_name, load.customer_id, "Customer")}
              />
            </p>
            <p className="text-[11px] text-slate-500">
              {t("driver.pickup")}: {load.pickup_location} → {t("driver.dropoff")}: {load.delivery_location}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
