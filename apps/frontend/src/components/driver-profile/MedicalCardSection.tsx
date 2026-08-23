import { formatDateUS } from "../../lib/formatDate";

export function MedicalCardSection({ medical, unavailable = false }: { medical: Record<string, unknown>; unavailable?: boolean }) {
  const color = String(medical.color_status ?? "gray");
  const colorClass =
    color === "red" ? "border-red-200 bg-red-50" : color === "yellow" ? "border-amber-200 bg-amber-50" : color === "green" ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-gray-50";
  const days = medical.days_until_expiration as number | null | undefined;

  return (
    <section className={`rounded-sm border p-4 ${colorClass}`}>
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Medical card (DOT)</h2>
      {unavailable ? <p className="mb-2 text-xs font-medium text-red-700">Medical card data could not be loaded.</p> : null}
      <p className="text-xs text-slate-700">
        {/* LV-DRIVER-PROFILE-RAW-ISO-DATES-REOPEN — display chrome only; day counts stay raw. */}
        Expires {formatDateUS(medical.expiration as string | null) || "—"}
        {days != null ? ` · ${days} days` : ""}
      </p>
      <p className="text-xs text-slate-600">Examiner {String(medical.examiner ?? "—")}</p>
      <p className="text-xs text-slate-600">Restrictions {String(medical.restrictions ?? "—")}</p>
    </section>
  );
}
