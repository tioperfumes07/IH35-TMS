// DISPATCH-UI-REFINE-2 ITEMS 3 & 5 — driver HOS display wired to the in-app HOS store (#1109
// getDriverHosStatus). No new feed, no Samsara call from the board. Renders the Samsara-standard
// 6-clock set (Drive/Shift/Break/Cycle/Stop By/Resume At) + a duty/health dot. When the store has no
// events for the driver, shows "No HOS data"/"—" — never the 70h default presented as real.
import { useQuery } from "@tanstack/react-query";
import { getDriverHosStatus } from "../../../api/dispatch";
import { ListErrorState } from "../../ListErrorState";
import {
  eldStatusDot,
  HOS_COLUMNS,
  HOS_PROJECTED_TOOLTIP,
  HOS_SOURCE_TOOLTIP,
  hosStatusDot,
  mergeEldWithInAppFallback,
  resolveDisplayHosClocks,
  type HosColumnKey,
} from "./hosClocks";

function useDriverHos(driverId: string | null | undefined, operatingCompanyId: string | null | undefined) {
  const companyId = operatingCompanyId?.trim() || undefined;
  const enabled = Boolean(driverId?.trim() && companyId);
  return useQuery({
    queryKey: ["dispatch-driver-hos-clocks", companyId, driverId],
    queryFn: () => getDriverHosStatus(String(driverId), String(companyId)),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

function HosRetryButton({ onRetry, compact = false }: { onRetry: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      data-hos-retry
      className="rounded-sm border border-slate-200 bg-slate-100 px-1 text-[10px] font-medium text-slate-700"
      aria-label="Retry driver HOS"
      title="Driver HOS unavailable — retry"
      onClick={(event) => {
        event.stopPropagation();
        onRetry();
      }}
    >
      {compact ? "!" : "Retry"}
    </button>
  );
}

// Small duty/HOS-health dot for next to a driver name (ITEM 5 + ITEM 3). HOS-PRC2: prefer the
// certified Samsara ELD violation flag; fall back to the in-app recompute only when Samsara has
// never polled this driver.
export function DriverHosStatusDot({ driverId, operatingCompanyId }: { driverId: string | null | undefined; operatingCompanyId: string | null | undefined }) {
  const q = useDriverHos(driverId, operatingCompanyId);
  if (q.isError) return <HosRetryButton compact onRetry={() => void q.refetch()} />;
  const eld = q.data?.eld_certified ?? null;
  const dot = eld ? eldStatusDot(eld) : hosStatusDot(q.data?.status ?? null);
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot.cls}`} title={dot.label} aria-label={dot.label} />;
}

// ITEM 3 — inline HOS block for Book Load section B (under the Driver / Team driver selects).
export function DriverHosClocksBlock({
  driverId,
  operatingCompanyId,
  heading,
}: {
  driverId: string | null | undefined;
  operatingCompanyId: string | null | undefined;
  heading: string;
}) {
  const q = useDriverHos(driverId, operatingCompanyId);
  const { clocks, eldRaw, mergedInAppFields } = resolveDisplayHosClocks(q.data);
  const dotEld = mergeEldWithInAppFallback(eldRaw, q.data ?? null);
  const dot = dotEld ? eldStatusDot(dotEld) : hosStatusDot(q.data?.status ?? null);

  if (q.isError) {
    return (
      <div className="rounded-sm border border-slate-200 bg-slate-50" data-hos-block="book-load">
        <ListErrorState
          title="Couldn't load driver HOS"
          status={0}
          message="The selected driver's HOS could not be read. Retry before relying on these clocks."
          onRetry={() => void q.refetch()}
          className="py-3"
        />
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-gray-200 bg-gray-50 px-2 py-1.5" data-hos-block="book-load">
      <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-600">
        <span className={`inline-block h-2 w-2 rounded-full ${dot.cls}`} title={dot.label} />
        {heading}
        {eldRaw ? (
          <span className="ml-1 rounded-sm bg-emerald-100 px-1 text-[8px] font-semibold uppercase tracking-[0.3px] text-emerald-700">
            Certified ELD
          </span>
        ) : driverId && q.data ? (
          <span className="ml-1 rounded-sm bg-slate-100 px-1 text-[8px] font-semibold uppercase tracking-[0.3px] text-slate-700">
            In-app fallback
          </span>
        ) : null}
      </div>
      {q.isLoading ? (
        <div className="text-[11px] text-gray-400">Loading HOS…</div>
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[11px] sm:grid-cols-6">
          {HOS_COLUMNS.map((col) => (
            <div key={col.key} title={col.derived ? HOS_PROJECTED_TOOLTIP : HOS_SOURCE_TOOLTIP}>
              <div className="text-[9px] uppercase tracking-[0.3px] text-gray-500">
                {col.label}
                {col.derived ? <span className="ml-0.5 text-gray-400">*</span> : null}
              </div>
              <div className="font-mono font-semibold text-gray-800">{clocks ? clocks[col.key] : "—"}</div>
            </div>
          ))}
        </div>
      )}
      <div className="hosnote mt-0.5 text-[9px] text-gray-400">
        {eldRaw
          ? mergedInAppFields
            ? "Certified ELD values shown where Samsara returned them; missing clocks use the in-app HOS store on this response. Stop by / Resume at are projected."
            : "Drive/Shift/Break/Cycle are Samsara's certified ELD values, verbatim. Stop by / Resume at are projected."
          : driverId && q.data
            ? "Certified ELD snapshot unavailable; showing in-app HOS fallback. Stop by / Resume at are projected."
            : "Select a driver to load HOS. Clocks populate from the Samsara feed. Stop by / Resume at are projected."}
      </div>
    </div>
  );
}

export function DriverHosClockValue({
  driverId,
  operatingCompanyId,
  colKey,
  showRetryOnError = false,
}: {
  driverId: string | null | undefined;
  operatingCompanyId: string | null | undefined;
  colKey: HosColumnKey;
  showRetryOnError?: boolean;
}) {
  const q = useDriverHos(driverId, operatingCompanyId);
  const { clocks } = resolveDisplayHosClocks(q.data);
  const col = HOS_COLUMNS.find((c) => c.key === colKey);
  if (!driverId) return <span className="text-gray-300">—</span>;
  if (q.isError) {
    return showRetryOnError ? <HosRetryButton onRetry={() => void q.refetch()} /> : <span className="text-gray-300">—</span>;
  }
  return (
    <span
      className="font-mono text-[11px] text-gray-700"
      data-hos-col={colKey}
      title={col?.derived ? HOS_PROJECTED_TOOLTIP : HOS_SOURCE_TOOLTIP}
    >
      {clocks ? clocks[colKey] : "—"}
    </span>
  );
}

export function DriverHosClockCells({ driverId, operatingCompanyId }: { driverId: string | null | undefined; operatingCompanyId: string | null | undefined }) {
  const q = useDriverHos(driverId, operatingCompanyId);
  const { clocks } = resolveDisplayHosClocks(q.data);
  if (q.isError) {
    return (
      <>
        {HOS_COLUMNS.map((col, index) => (
          <td key={col.key} className="px-3 py-2 text-[11px] text-slate-500" data-hos-col={col.key}>
            {index === 0 ? <HosRetryButton onRetry={() => void q.refetch()} /> : "—"}
          </td>
        ))}
      </>
    );
  }
  return (
    <>
      {HOS_COLUMNS.map((col) => (
        <td
          key={col.key}
          className="px-3 py-2 font-mono text-[11px] text-gray-700"
          data-hos-col={col.key}
          title={col.derived ? HOS_PROJECTED_TOOLTIP : HOS_SOURCE_TOOLTIP}
        >
          {clocks ? clocks[col.key] : "—"}
        </td>
      ))}
    </>
  );
}
