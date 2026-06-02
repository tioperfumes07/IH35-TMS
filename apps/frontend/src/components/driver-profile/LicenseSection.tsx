function expColor(days: number | null | undefined) {
  if (days == null) return "text-slate-600";
  if (days < 0) return "text-red-700";
  if (days <= 30) return "text-amber-700";
  return "text-emerald-700";
}

export function LicenseSection({ license }: { license: Record<string, unknown> }) {
  const endorsements = (license.endorsements as Record<string, boolean>) ?? {};
  const labels = ["h", "n", "p", "s", "t", "x"] as const;
  const days = license.days_until_expiration as number | null | undefined;

  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">License & endorsements</h2>
      <div className="grid gap-2 text-xs text-slate-700 md:grid-cols-2">
        <div>CDL {String(license.cdl_number ?? "—")}</div>
        <div>
          Class {String(license.class ?? "—")} · {String(license.state ?? "—")}
        </div>
        <div className={expColor(days)}>
          Expires {String(license.expiration ?? "—")}
          {days != null ? ` (${days}d)` : ""}
        </div>
        <div>Restrictions {String(license.restrictions ?? "—")}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {labels.map((key) => (
          <span
            key={key}
            className={`rounded px-2 py-0.5 text-xs font-semibold ${
              endorsements[key] ? "bg-sky-100 text-sky-800" : "bg-gray-100 text-gray-400"
            }`}
          >
            {key.toUpperCase()}
          </span>
        ))}
      </div>
    </section>
  );
}
