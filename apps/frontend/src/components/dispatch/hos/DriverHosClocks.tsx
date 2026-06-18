// DISPATCH-UI-REFINE-2 ITEMS 3 & 5 — driver HOS display wired to the in-app HOS store (#1109
// getDriverHosStatus). No new feed, no Samsara call from the board. Renders the Samsara-standard
// 6-clock set (Drive/Shift/Break/Cycle/Stop By/Resume At) + a duty/health dot. When the store has no
// events for the driver, shows "No HOS data"/"—" — never the 70h default presented as real.
import { useQuery } from "@tanstack/react-query";
import { getDriverHosStatus } from "../../../api/dispatch";
import {
  computeHosClocks,
  HOS_COLUMNS,
  HOS_PROJECTED_TOOLTIP,
  hosStatusDot,
  type HosColumnKey,
  type HosStatusRow,
} from "./hosClocks";

function useDriverHos(driverId: string | null | undefined, operatingCompanyId: string | undefined) {
  const enabled = Boolean(driverId && operatingCompanyId);
  return useQuery({
    queryKey: ["dispatch-driver-hos-clocks", operatingCompanyId, driverId],
    queryFn: () => getDriverHosStatus(String(driverId), String(operatingCompanyId)),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

// Small duty/HOS-health dot for next to a driver name (ITEM 5 + ITEM 3).
export function DriverHosStatusDot({ driverId, operatingCompanyId }: { driverId: string | null | undefined; operatingCompanyId: string | undefined }) {
  const q = useDriverHos(driverId, operatingCompanyId);
  const dot = hosStatusDot(q.data?.status ?? null);
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot.cls}`} title={dot.label} aria-label={dot.label} />;
}

// ITEM 3 — inline HOS block for Book Load section B (under the Driver / Team driver selects).
export function DriverHosClocksBlock({
  driverId,
  operatingCompanyId,
  heading,
}: {
  driverId: string | null | undefined;
  operatingCompanyId: string | undefined;
  heading: string;
}) {
  const q = useDriverHos(driverId, operatingCompanyId);
  if (!driverId) return null;
  const clocks = computeHosClocks(q.data as HosStatusRow | undefined);
  const dot = hosStatusDot(q.data?.status ?? null);

  return (
    <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1.5" data-hos-block="book-load">
      <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-600">
        <span className={`inline-block h-2 w-2 rounded-full ${dot.cls}`} title={dot.label} />
        {heading}
      </div>
      {q.isLoading ? (
        <div className="text-[11px] text-gray-400">Loading HOS…</div>
      ) : !clocks ? (
        <div className="text-[11px] text-gray-500">No HOS data</div>
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[11px] sm:grid-cols-6">
          {HOS_COLUMNS.map((col) => (
            <div key={col.key} title={col.derived ? HOS_PROJECTED_TOOLTIP : col.samsaraField}>
              <div className="text-[9px] uppercase tracking-[0.3px] text-gray-500">
                {col.label}
                {col.derived ? <span className="ml-0.5 text-gray-400">*</span> : null}
              </div>
              <div className="font-mono font-semibold text-gray-800">{clocks[col.key]}</div>
            </div>
          ))}
        </div>
      )}
      {clocks ? <div className="mt-0.5 text-[9px] text-gray-400">* Stop By / Resume At are projected (continuous driving).</div> : null}
    </div>
  );
}

// ITEM 5 (board) — a SINGLE HOS clock value for one column, for grids that wrap each column in their
// own <td> (DispatchBoard's shared column model). Reuses the exact same store query + projection as the
// 6-cell fragment so the List and the Board show identical numbers. Renders "—" until HOS data flows.
export function DriverHosClockValue({
  driverId,
  operatingCompanyId,
  colKey,
}: {
  driverId: string | null | undefined;
  operatingCompanyId: string | undefined;
  colKey: HosColumnKey;
}) {
  const q = useDriverHos(driverId, operatingCompanyId);
  const clocks = computeHosClocks(q.data as HosStatusRow | undefined);
  const col = HOS_COLUMNS.find((c) => c.key === colKey);
  if (!driverId) return <span className="text-gray-300">—</span>;
  return (
    <span
      className="font-mono text-[11px] text-gray-700"
      data-hos-col={colKey}
      title={col?.derived ? HOS_PROJECTED_TOOLTIP : col?.samsaraField}
    >
      {clocks ? clocks[colKey] : "—"}
    </span>
  );
}

// ITEM 5 — six list cells (one query per row). Returns a fragment of <td>s so it slots into the
// existing <tr> exactly where the single HOS column was, keeping the grid aligned.
export function DriverHosClockCells({ driverId, operatingCompanyId }: { driverId: string | null | undefined; operatingCompanyId: string | undefined }) {
  const q = useDriverHos(driverId, operatingCompanyId);
  const clocks = computeHosClocks(q.data as HosStatusRow | undefined);
  return (
    <>
      {HOS_COLUMNS.map((col) => (
        <td
          key={col.key}
          className="px-3 py-2 font-mono text-[11px] text-gray-700"
          data-hos-col={col.key}
          title={col.derived ? HOS_PROJECTED_TOOLTIP : col.samsaraField}
        >
          {clocks ? clocks[col.key] : "—"}
        </td>
      ))}
    </>
  );
}
