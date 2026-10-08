/**
 * ORDERS DRIVER PROFILE — Samsara link + duplicate-record warning (show, never fix).
 * GET /api/v1/drivers/:id/profile/samsara
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[#0F1219]">Samsara link</h2>
        {/* Owner law 2026-10-05: many Samsara users map into ONE driver profile (Samsara names never change). */}
        <Link
          to="/samsara/driver-mapping"
          className="text-xs font-semibold text-[#1F2A44] underline"
          data-testid="dp-samsara-open-mapping"
        >
          Map Samsara users
        </Link>
      </div>
      {samsara_accounts.length === 0 ? (
        <p className="text-xs text-[#6B7280]">No Samsara account mapped to this driver.</p>
      ) : (
        <ul className="mb-2 space-y-1 text-xs text-[#1F2A44]">
          {samsara_accounts.map((a) => {
            const accountLabel = a.samsara_username?.trim()
              ? a.samsara_username
              : `Samsara account ${String(a.samsara_driver_id).slice(-6)}`;
            return (
              <li key={a.samsara_driver_id}>
                {accountLabel}
                {a.last_login_at ? ` · last login ${formatDateTimeUS(a.last_login_at)}` : ""}
                {a.is_active === false ? " · inactive" : ""}
              </li>
            );
          })}
        </ul>
      )}
      {duplicate_warning ? (
        <div
          className="border-t border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1.5 text-xs text-[#1F2A44]"
          data-testid="dp-samsara-duplicate-warning"
          role="status"
        >
          <strong className="font-semibold">Duplicate Samsara record warning.</strong> Another live local
          driver still carries one of these Samsara ids. Use Map Samsara users (tick “Same person”) to
          bring them into one driver profile.
          <ul className="mt-1 list-disc pl-4">
            {other_live_drivers_with_these_ids.map((o) => {
              const samsaraTail = String(o.samsara_driver_id).slice(-6);
              return (
                <li key={o.driver_id}>
                  <EntityLink kind="driver" id={o.driver_id} label={o.name?.trim() || "Driver"} />
                  {o.status ? ` · ${o.status}` : ""} · Samsara …{samsaraTail}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
