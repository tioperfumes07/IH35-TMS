type Props = {
  label: string;
  expiresAt: string | null | undefined;
};

function getDaysUntil(expiresAt: string): number | null {
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return null;
  const now = new Date();
  const expiryUtc = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate());
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((expiryUtc - nowUtc) / (24 * 60 * 60 * 1000));
}

function statusForDays(days: number | null): "critical" | "warn" | "ok" | "unknown" {
  if (days == null) return "unknown";
  if (days < 14) return "critical";
  if (days <= 30) return "warn";
  return "ok";
}

function classNameForStatus(status: ReturnType<typeof statusForDays>): string {
  if (status === "critical") return "bg-red-100 text-red-700 border-red-200";
  if (status === "warn") return "bg-amber-100 text-amber-700 border-amber-200";
  if (status === "ok") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

export function CertExpiryBadge({ label, expiresAt }: Props) {
  const days = expiresAt ? getDaysUntil(expiresAt) : null;
  const status = statusForDays(days);
  const detail =
    expiresAt == null
      ? "No date"
      : days == null
        ? expiresAt
        : days < 0
          ? `${Math.abs(days)}d overdue`
          : `${days}d`;

  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${classNameForStatus(status)}`}>
      {label}: {detail}
    </span>
  );
}
