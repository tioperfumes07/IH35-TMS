import { PlatesTable } from "./PlatesTable";
import { formatDateUS } from "../../lib/formatDate";

// §7 punchlist #107 (dates rendered raw instead of MM/DD/YYYY) applies identically here — same
// antipattern as the vehicle-profile ComplianceSection.
function fmtDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return formatDateUS(value as string) || "—";
}

export function ComplianceSection({
  compliance,
  plates,
}: {
  compliance: Record<string, unknown>;
  plates: Array<Record<string, unknown>>;
}) {
  const dot = compliance.dot_inspection as Record<string, unknown> | undefined;
  const us = compliance.us_insurance as Record<string, unknown> | undefined;
  const mx = compliance.mx_insurance as Record<string, unknown> | undefined;
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <h2 className="text-xs font-semibold text-gray-800">Compliance</h2>
      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
        <div>DOT next due: {fmtDate(dot?.next_due)}</div>
        <div>US insurance exp: {fmtDate(us?.expiration)}</div>
        <div>MX insurance exp: {fmtDate(mx?.expiration)}</div>
      </div>
      <PlatesTable plates={plates} />
    </section>
  );
}
