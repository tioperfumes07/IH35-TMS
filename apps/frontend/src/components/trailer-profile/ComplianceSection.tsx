import { PlatesTable } from "./PlatesTable";

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
    <section className="rounded border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-800">Compliance</h2>
      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
        <div>DOT next due: {String(dot?.next_due ?? "—")}</div>
        <div>US insurance exp: {String(us?.expiration ?? "—")}</div>
        <div>MX insurance exp: {String(mx?.expiration ?? "—")}</div>
      </div>
      <PlatesTable plates={plates} />
    </section>
  );
}
