export function MedicalCardSection({ medical }: { medical: Record<string, unknown> }) {
  const color = String(medical.color_status ?? "gray");
  const colorClass =
    color === "red" ? "border-red-200 bg-red-50" : color === "yellow" ? "border-amber-200 bg-amber-50" : color === "green" ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-gray-50";
  const days = medical.days_until_expiration as number | null | undefined;

  return (
    <section className={`rounded border p-4 ${colorClass}`}>
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Medical card (DOT)</h2>
      <p className="text-xs text-slate-700">
        Expires {String(medical.expiration ?? "—")}
        {days != null ? ` · ${days} days` : ""}
      </p>
      <p className="text-xs text-slate-600">Examiner {String(medical.examiner ?? "—")}</p>
      <p className="text-xs text-slate-600">Restrictions {String(medical.restrictions ?? "—")}</p>
    </section>
  );
}
