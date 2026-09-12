import { formatDateUS } from "../../lib/formatDate";

export function MedicalCardSection({ medical, unavailable = false }: { medical: Record<string, unknown>; unavailable?: boolean }) {
  const color = String(medical.color_status ?? "gray");
  const colorClass =
    color === "red" ? "border-red-200 bg-red-50" : color === "yellow" ? "border-amber-200 bg-amber-50" : color === "green" ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-gray-50";
  const days = medical.days_until_expiration as number | null | undefined;

  return (
    <section className={`rounded-sm border p-4 ${colorClass}`}>
      <h2 className="mb-2 text-xs font-semibold text-slate-900">Medical card (DOT)</h2>
      {unavailable ? <p className="mb-2 text-xs font-medium text-red-700">Medical card data could not be loaded.</p> : null}
      <p className="text-xs text-slate-700">
        {/* LV-DRIVER-PROFILE-RAW-ISO-DATES-REOPEN — display chrome only; day counts stay raw. */}
        {/* DRIVER-COMPLIANCE-01 (owner/Claude Lead 2026-09-11): a bare "—" reads as N/A, not as
            "this driver has no medical certificate on file" -- say it plainly instead. */}
        {medical.expiration ? (
          <>
            Expires {formatDateUS(medical.expiration as string)}
            {days != null ? ` · ${days} days` : ""}
          </>
        ) : (
          <span className="font-medium">Missing — no document</span>
        )}
      </p>
      <p className="text-xs text-slate-600">Examiner {String(medical.examiner ?? "—")}</p>
      <p className="text-xs text-slate-600">Restrictions {String(medical.restrictions ?? "—")}</p>
    </section>
  );
}
