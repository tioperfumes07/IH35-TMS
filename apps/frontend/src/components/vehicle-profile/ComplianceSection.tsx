import { formatDateUS } from "../../lib/formatDate";
import { StatusBadge } from "../layout/StatusBadge";

// §7 punchlist #107/#110: dates were rendered raw (String(value), e.g. "2027-03-15") instead of
// the locked MM/DD/YYYY display format, and expiry status used filled green/yellow/red backgrounds
// instead of the locked palette (red reserved for delete/Accident, green reserved for the Class
// pill). Fixed by routing every date through formatDateUS and every status signal through the
// shared, design-token-driven StatusBadge (crit/warn/positive/neutral) already used across the app
// (e.g. MissingRequiredChip).

function fmtDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return formatDateUS(value as string) || "—";
}

function statusVariant(color: string | undefined): "crit" | "warn" | "positive" | "neutral" | null {
  if (color === "red") return "crit";
  if (color === "yellow") return "warn";
  if (color === "green") return "positive";
  return null;
}

function statusLabel(color: string | undefined): string {
  if (color === "red") return "Expired";
  if (color === "yellow") return "Expiring soon";
  if (color === "green") return "OK";
  return "";
}

function InsuranceRow({ label, insurance }: { label: string; insurance: Record<string, unknown> }) {
  const variant = statusVariant(insurance.color as string | undefined);
  return (
    <div className="flex items-center justify-between gap-2 rounded-sm border border-gray-200 p-2">
      <span>
        {label} exp {fmtDate(insurance.expiration)} ({String(insurance.days_until_expiration ?? "—")}d)
      </span>
      {variant ? <StatusBadge variant={variant}>{statusLabel(insurance.color as string | undefined)}</StatusBadge> : null}
    </div>
  );
}

export function ComplianceSection({ compliance }: { compliance: Record<string, unknown> }) {
  const us = (compliance.us_insurance as Record<string, unknown>) ?? {};
  const mx = (compliance.mx_insurance as Record<string, unknown>) ?? {};
  const plates = (compliance.registration_plates as Array<Record<string, unknown>>) ?? [];
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-800">Compliance</h3>
      <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
        <InsuranceRow label="US insurance" insurance={us} />
        <InsuranceRow label="MX insurance" insurance={mx} />
        <div>DOT inspection: {fmtDate((compliance.dot_inspection as Record<string, unknown>)?.next_due)}</div>
        <div>SCT: {String((compliance.sct_permit as Record<string, unknown>)?.number ?? "—")}</div>
        <div>PITA: {String((compliance.pita as Record<string, unknown>)?.status ?? "—")}</div>
        <div>IFTA filed: {String(compliance.ifta_current_quarter_filed ? "yes" : "no")}</div>
      </div>
      {plates.length > 0 ? (
        <table className="mt-3 min-w-full text-xs">
          <thead>
            <tr className="text-gray-500">
              <th className="px-2 py-1 text-left">Country</th>
              <th className="px-2 py-1 text-left">Jurisdiction</th>
              <th className="px-2 py-1 text-left">Expiration</th>
            </tr>
          </thead>
          <tbody>
            {plates.map((p, idx) => (
              <tr key={idx} className="border-t border-gray-100">
                <td className="px-2 py-1">{String(p.country)}</td>
                <td className="px-2 py-1">{String(p.jurisdiction)}</td>
                <td className="px-2 py-1">{fmtDate(p.expiration)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
