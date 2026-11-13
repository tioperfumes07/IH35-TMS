import { withReturnContext } from "../../lib/returnContext";
import type { FuelBoardPeriodId } from "./fuelBoardPeriod";

/** ROUND 8.20 board19 — View all carries period + ret so by-truck opens same month and Back restores Home. */
export function fuelBoardViewAllHref(period: FuelBoardPeriodId, originHref: string): string {
  const target = period === "oct" ? "/fuel/by-truck" : `/fuel/by-truck?period=${encodeURIComponent(period)}`;
  return withReturnContext(target, originHref);
}
