import type { EntityPickerOption } from "../../../../components/parity/entityPickerRegistry";
import type { DispatchLoadRow } from "../../../../api/loads";

/**
 * LEAD 443.257-A item 3 (owner 10-22): the Book Load driver list is ordered
 *   (a) the usual driver of the chosen truck — labelled "Usual on T163" (a SUGGESTION: never auto-locked, never required);
 *   (b) free drivers — no load in motion / booked;
 *   (c) everyone else — labelled "On load 13690".
 * Pure: re-orders and relabels; never adds or drops a driver.
 */
export const DRIVER_BUSY_STATUSES = ["assigned_not_dispatched", "booked", "dispatched", "at_pickup", "in_transit", "at_delivery", "loaded"] as const;

export function driverLoadsFromBoard(loads: Pick<DispatchLoadRow, "assigned_primary_driver_id" | "load_number" | "status">[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of loads) {
    if (!l.assigned_primary_driver_id || !(DRIVER_BUSY_STATUSES as readonly string[]).includes(String(l.status))) continue;
    if (!out.has(l.assigned_primary_driver_id)) out.set(l.assigned_primary_driver_id, String(l.load_number));
  }
  return out;
}

export function rankDriverOptions(
  options: EntityPickerOption[],
  ctx: { usualDriverId?: string | null; unitLabel?: string | null; onLoadByDriver: Map<string, string> },
): EntityPickerOption[] {
  const tag = (o: EntityPickerOption, text: string) => ({ ...o, sublabel: o.sublabel ? `${text} · ${o.sublabel}` : text });
  const usual: EntityPickerOption[] = [];
  const free: EntityPickerOption[] = [];
  const busy: EntityPickerOption[] = [];
  for (const o of options) {
    const onLoad = ctx.onLoadByDriver.get(o.value);
    if (ctx.usualDriverId && o.value === ctx.usualDriverId) {
      usual.push(tag(o, [`Usual on ${ctx.unitLabel ?? "this truck"}`, onLoad ? `On load ${onLoad}` : "Free"].join(" · ")));
    } else if (onLoad) busy.push(tag(o, `On load ${onLoad}`));
    else free.push(tag(o, "Free"));
  }
  return [...usual, ...free, ...busy];
}
