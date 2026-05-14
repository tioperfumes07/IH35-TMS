import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listDriverLoads, type DriverLoad } from "../../api/driver";

export function DriverLoadsPage() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["driver", "loads"], queryFn: listDriverLoads });

  if (q.isLoading) return <p className="text-sm text-gray-600">…</p>;
  if (q.error) return <p className="text-sm text-red-600">Could not load.</p>;
  const loads = q.data ?? [];
  if (loads.length === 0) return <p className="text-sm text-gray-700">{t("driver.no_loads")}</p>;

  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold">{t("driver.loads_title")}</h2>
      <ul className="space-y-2">
        {loads.map((load: DriverLoad) => (
          <li key={load.id} className="rounded border border-slate-200 bg-white p-3">
            <Link className="font-medium text-slate-900" to={`/driver/loads/${load.id}`}>
              {load.display_id}
            </Link>
            <p className="text-xs text-slate-600">{load.customer_name}</p>
            <p className="text-[11px] text-slate-500">
              {t("driver.pickup")}: {load.pickup_location} → {t("driver.dropoff")}: {load.delivery_location}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
