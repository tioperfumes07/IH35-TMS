import { companyToday } from "../../lib/businessDate";

type Props = {
  label: string;
  expiresAt: string | null | undefined;
};

function getDaysUntil(expiresAt: string): number | null {
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return null;
  const expiryUtc = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate());
  const [year, month, day] = companyToday().split("-").map(Number);
  const nowUtc = Date.UTC(year, month - 1, day);
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
  if (status === "warn") return "bg-[#E5E7EB] text-[#1F2A44] border-[#E5E7EB]";
  if (status === "ok") return "bg-[#E5E7EB] text-[#1F2A44] border-[#E5E7EB]";
  return "bg-[#E5E7EB] text-[#4B5563] border-[#E5E7EB]";
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
    <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-semibold ${classNameForStatus(status)}`}>
      {label}: {detail}
    </span>
  );
}
