export function PerformanceScorecardSection({ scorecard }: { scorecard: Record<string, unknown> | null }) {
  if (!scorecard) {
    return (
      <section className="rounded border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800">Performance scorecard</h2>
        <p className="mt-2 text-xs text-gray-500">No Samsara safety data for the last 30 days.</p>
      </section>
    );
  }
  const cards = [
    ["Score", String(scorecard.score ?? "—")],
    ["Events", String(scorecard.total_events ?? 0)],
    ["Harsh braking", String(scorecard.harsh_braking ?? 0)],
    ["Speeding", String(scorecard.speeding ?? 0)],
    ["Distracted", String(scorecard.distracted ?? 0)],
    ["Fleet rank", String(scorecard.rank_in_fleet ?? "—")],
  ];
  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-800">Performance scorecard (30 days)</h2>
      <p className="text-xs text-gray-500">Fleet avg score: {String(scorecard.fleet_avg_score ?? "—")}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded border border-gray-100 bg-gray-50 p-2">
            <div className="text-[10px] uppercase text-gray-500">{label}</div>
            <div className="text-lg font-semibold text-gray-900">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
