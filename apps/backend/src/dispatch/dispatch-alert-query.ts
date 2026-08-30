import { z } from "zod";

export const dispatchAlertQueryFields = {
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z.enum(["event_at", "load_number", "customer_name", "driver_name", "unit_number", "status"]).default("event_at"),
  direction: z.enum(["asc", "desc"]).default("asc"),
};

export type DispatchAlertQuery = {
  from?: string;
  to?: string;
  sort: "event_at" | "load_number" | "customer_name" | "driver_name" | "unit_number" | "status";
  direction: "asc" | "desc";
};

export function dispatchAlertDateRangeIsValid(query: { from?: string; to?: string }): boolean {
  return !(query.from && query.to && query.from > query.to);
}

export function dispatchAlertOrderBy(
  query: DispatchAlertQuery,
  columns: Record<DispatchAlertQuery["sort"], string>,
): string {
  const column = columns[query.sort];
  const direction = query.direction === "desc" ? "DESC" : "ASC";
  return `${column} ${direction} NULLS LAST`;
}
