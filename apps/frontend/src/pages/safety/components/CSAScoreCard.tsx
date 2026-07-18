type Props = {
  latest: Record<string, unknown> | null | undefined;
};

export function CSAScoreCard({ latest }: Props) {
  const rawPoints = latest?.total_violations;
  const points = rawPoints == null || rawPoints === "" ? null : Number(rawPoints);
  return (
    <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs">
      <div className="mb-1 text-sm font-semibold">Internal inspection-point rollup</div>
      <div>Points: {points != null && Number.isFinite(points) ? points : "Unavailable"}</div>
      <div>Cached at: {String(latest?.cached_at ?? "n/a")}</div>
      <div className="mt-2 text-[11px] text-gray-500">
        Not an FMCSA BASIC percentile. Hazmat requires authenticated carrier SMS.
      </div>
    </div>
  );
}
