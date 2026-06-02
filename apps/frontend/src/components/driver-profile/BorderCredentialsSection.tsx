function expClass(dateStr: string | null | undefined) {
  if (!dateStr) return "text-gray-600";
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return "text-red-700";
  if (days <= 30) return "text-yellow-700";
  return "text-green-700";
}

export function BorderCredentialsSection({ border }: { border: Record<string, unknown> }) {
  const fast = border.fast_card as Record<string, unknown> | undefined;
  const sentri = border.sentri as Record<string, unknown> | undefined;
  const twic = border.twic as Record<string, unknown> | undefined;
  const passport = border.passport as Record<string, unknown> | undefined;
  const mx = border.mexican_license as Record<string, unknown> | undefined;
  const visa = border.visa_b1 as Record<string, unknown> | undefined;
  const cards = [
    ["FAST card", fast?.number, fast?.expiration],
    ["SENTRI", sentri?.member ? "Member" : "Not enrolled", sentri?.expiration],
    ["TWIC", twic?.number, twic?.expiration],
    ["Passport", passport?.number, passport?.expiration],
    ["Mexican license", mx?.number, mx?.expiration],
    ["B1 visa", visa?.status, null],
  ] as const;
  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-800">Border ops credentials</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([title, primary, exp]) => (
          <div key={title} className="rounded border border-gray-100 p-3">
            <div className="text-[10px] uppercase text-gray-500">{title}</div>
            <div className="text-sm font-medium text-gray-900">{String(primary ?? "—")}</div>
            {exp ? <div className={`text-xs ${expClass(String(exp))}`}>Exp {String(exp)}</div> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
