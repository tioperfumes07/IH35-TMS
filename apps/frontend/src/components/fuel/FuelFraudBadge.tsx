type Props = {
  hasOpenCritical?: boolean;
  className?: string;
};

export function FuelFraudBadge({ hasOpenCritical = false, className = "" }: Props) {
  if (!hasOpenCritical) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white ${className}`}
      title="Open critical fuel fraud alert"
    >
      Fraud
    </span>
  );
}
