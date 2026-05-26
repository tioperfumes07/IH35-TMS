type SafetyEventsSummaryCardProps = {
  title: string;
  value: number;
};

export function SafetyEventsSummaryCard({ title, value }: SafetyEventsSummaryCardProps) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    </article>
  );
}
