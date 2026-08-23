import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getDriverHos, type HosSnapshot } from "../../api/driver";
import { formatDateTimeUS } from "../../lib/formatDate";
import { ListErrorState } from "../../components/ListErrorState";

export function DriverHosPage() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["driver", "hos"], queryFn: getDriverHos });
  if (q.isLoading) return <p className="text-sm text-gray-600">…</p>;
  if (q.isError) {
    return (
      <ListErrorState
        title="Couldn't load HOS status"
        status={0}
        message={q.error instanceof Error ? q.error.message : undefined}
        onRetry={() => void q.refetch()}
      />
    );
  }
  if (!q.data) return <p className="text-sm text-gray-600">No HOS snapshot is available.</p>;
  const snap = q.data;
  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold">{t("driver.hos_title")}</h2>
      <p className="text-xs text-slate-600">
        {t("driver.hos_synced")}: {formatDateTimeUS(snap.last_synced_at)} CT
      </p>
      <p className="text-xs">
        {t("driver.duty_status")}: <span className="font-semibold">{snap.duty_status}</span>
      </p>
      <div className="rounded-sm border border-slate-200 bg-white p-2">
        <p className="text-[11px] font-semibold text-slate-500">{t("driver.clocks")}</p>
        <ul className="mt-1 space-y-1 text-xs">
          {snap.clocks.map((c: HosSnapshot["clocks"][number]) => (
            <li key={c.key}>
              {c.key}: {c.remaining_minutes} / {c.max_minutes} {t("driver.minutes")}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
