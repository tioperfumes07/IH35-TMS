type Props = {
  latest: Record<string, unknown> | null | undefined;
};

export function CSAScoreCard({ latest }: Props) {
  return (
    <div className="rounded border border-gray-200 bg-white p-3 text-xs">
      <div className="mb-1 text-sm font-semibold">CSA Score (latest cache)</div>
      <div>Score: {Number(latest?.score_total ?? latest?.score ?? 0)}</div>
      <div>Cached at: {String(latest?.cached_at ?? "n/a")}</div>
      <div className="mt-2 text-[11px] text-gray-500">FMCSA SAFER live pull is Phase 4.</div>
    </div>
  );
}
