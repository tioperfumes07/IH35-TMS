/**
 * ORDERS DRIVER PROFILE — Samsara link + duplicate-record warning (show, never fix).
 * GET /api/v1/drivers/:id/profile/samsara
 */
import { useQuery } from "@tanstack/react-query";
import { getDriverProfileSamsara } from "../../api/driver-profile-tabs";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorState } from "../ListErrorState";
import { formatDateTimeUS } from "../../lib/formatDate";

export function DriverSamsaraDuplicateBanner({
  companyId,
  driverId,
}: {
  companyId: string;
  driverId: string;
}) {
  const q = useQuery({
    queryKey: ["driver-profile", "samsara", companyId, driverId],
    queryFn: () => getDriverProfileSamsara(companyId, driverId),
    enabled: Boolean(companyId && driverId),
  });

  if (q.isError) {
    return (
      <ListErrorState
        title="Couldn't load Samsara link"
        status={0}
        message={(q.error as Error)?.message}
        onRetry={() => void q.refetch()}
      />
    );
  }
  if (q.isLoading || !q.data) return null;

  const { samsara_accounts, other_live_drivers_with_these_ids, duplicate_warning } = q.data;

  return (
    <section
      className="rounded-sm border border-gray-200 bg-white p-3"
      data-testid="dp-section-samsara-link"
      data-dp-samsara="1"
      data-dp-samsara-duplicate={duplicate_warning ? "1" : "0"}
    >
      <h2 className="mb-1 text-xs font-semibold text-slate-900">Samsara link</h2>
      {samsara_accounts.length === 0 ? (
        <p className="text-xs text-slate-500">No Samsara account mapped to this driver.</p>
      ) : (
        <ul className="mb-2 space-y-1 text-xs text-slate-700">
          {samsara_accounts.map((a) => (
            <li key={a.samsara_driver_id}>
              {a.samsara_username || a.samsara_driver_id}
              {a.last_login_at ? ` · last login ${formatDateTimeUS(a.last_login_at)}` : ""}
              {a.is_active === false ? " · inactive" : ""}
            </li>
          ))}
        </ul>
      )}
      {duplicate_warning ? (
        <div
          className="rounded-sm border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-950"
          data-testid="dp-samsara-duplicate-warning"
          role="status"
        >
          <strong className="font-semibold">Duplicate Samsara record warning.</strong> Another live local
          driver still carries one of these Samsara ids. Show only — do not merge or deactivate from this
          screen.
          <ul className="mt-1 list-disc pl-4">
            {other_live_drivers_with_these_ids.map((o) => (
              <li key={o.driver_id}>
                <EntityLink kind="driver" id={o.driver_id} label={o.name?.trim() || o.driver_id} />
                {o.status ? ` · ${o.status}` : ""} · Samsara {o.samsara_driver_id}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
