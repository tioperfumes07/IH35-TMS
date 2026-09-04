export type BookLoadValidationIssue = {
  path: string;
  ruleCode: string;
  description: string;
};

const FIELD_LABELS: Record<string, string> = {
  customer_id: "Customer",
  trip_type: "Trip Type",
  rate_total_cents: "Rate",
  team_id: "Team",
  assigned_unit_id: "Truck",
  assigned_trailer_unit_id: "Trailer",
  assigned_primary_driver_id: "Driver",
  commodity: "Commodity",
  weight_lbs: "Weight",
  trailer_type: "Trailer type",
  reefer_setpoint: "Reefer setpoint",
  detention_reason_id: "Detention reason",
  address_full: "Address",
  address_line1: "Address",
  city: "City",
  state: "State",
  postal_code: "ZIP code",
  scheduled_arrival_at: "Date and time",
  appointment_start_at: "Appointment start",
  appointment_end_at: "Appointment end",
  pickup_time_type_id: "Pickup type",
};

const META_KEYS = new Set(["type", "types", "message", "ref", "root"]);

function issueReason(error: Record<string, unknown>): string {
  if (typeof error.message === "string" && error.message.trim()) return error.message.trim();
  if (error.type === "required") return "This field is required";
  return "This field did not pass validation";
}

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, " ");
}

function ruleCode(error: Record<string, unknown>): string {
  return typeof error.type === "string" && error.type.trim()
    ? error.type.trim()
    : "validation";
}

export function describeBookLoadValidationErrors(
  errors: unknown,
  stops: Array<{ stop_type?: string }> = []
): BookLoadValidationIssue[] {
  const issues: BookLoadValidationIssue[] = [];

  function visit(value: unknown, path: string[]): void {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.message === "string" || typeof record.type === "string") {
      const fullPath = path.join(".");
      const stopIndex = path[0] === "stops" && /^\d+$/.test(path[1] ?? "") ? Number(path[1]) : null;
      const field = path.at(-1) ?? fullPath;
      const failedRule = ruleCode(record);
      if (stopIndex !== null) {
        const kind = String(stops[stopIndex]?.stop_type ?? (stopIndex % 2 === 0 ? "pickup" : "delivery"));
        const stopKind = kind === "pickup" ? "Pickup" : kind === "delivery" ? "Delivery" : "Stop";
        issues.push({
          path: fullPath,
          ruleCode: failedRule,
          description: `Stop ${stopIndex + 1} (${stopKind}) — ${fieldLabel(field)}: ${issueReason(record)} [rule: ${failedRule}]`,
        });
      } else {
        issues.push({
          path: fullPath,
          ruleCode: failedRule,
          description: `${fieldLabel(field)}: ${issueReason(record)} [rule: ${failedRule}]`,
        });
      }
      return;
    }
    for (const [key, child] of Object.entries(record)) {
      if (!META_KEYS.has(key)) visit(child, [...path, key]);
    }
  }

  visit(errors, []);
  return issues;
}
