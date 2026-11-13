import { withReturnContext } from "../../lib/returnContext";
import type { FuelBoardPeriodId } from "./fuelBoardPeriod";

/** ROUND 8.20 board19 — View all ALWAYS carries period + ret so by-truck opens same month and Back restores Home.
 *  Never omit `period=` (even for default `oct`) — FE lag / by-truck default drift made October→View all look like November. */
export function fuelBoardViewAllHref(period: FuelBoardPeriodId, originHref: string): string {
  const target = `/fuel/by-truck?period=${encodeURIComponent(period)}`;
  return withReturnContext(target, originHref);
}
