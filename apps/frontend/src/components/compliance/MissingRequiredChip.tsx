import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "../layout/StatusBadge";
import {
  fetchMissingRequired,
  type MissingRequiredEntityKind,
  type MissingRequiredSummary,
} from "../../api/compliance";

// DOC-REQ-2c — per-profile "missing required documents" chip. Read-only: reads the DOC-REQ-2b resolver and
// surfaces how many required documents an entity is missing, worst-enforcement first, with the specifics in
// the tooltip. Palette-safe: amber `warn` for anything missing (never the locked delete/accident red), green
// `positive` when complete. Renders nothing while loading, on error, or with no company context — a broken or
// absent chip must never read as a false GREEN.

type Props = {
  operatingCompanyId: string | null | undefined;
  entityKind: MissingRequiredEntityKind;
  entityId: string | null | undefined;
};

function tooltip(summary: MissingRequiredSummary): string {
  const missing = summary.required.filter((r) => !r.satisfied);
  if (missing.length === 0) return "All required documents present.";
  const lines = missing.map((m) => {
    const blocks = m.enforcement === "hard_block" ? " (blocks dispatch)" : "";
    const manual = m.needs_manual ? " (needs manual verification)" : "";
    return `• ${m.label}${blocks}${manual}`;
  });
  return `Missing required documents:\n${lines.join("\n")}`;
}

export function MissingRequiredChip({ operatingCompanyId, entityKind, entityId }: Props) {
  const enabled = Boolean(operatingCompanyId && entityId);
  const { data, isSuccess } = useQuery({
    queryKey: ["missing-required", entityKind, entityId, operatingCompanyId],
    queryFn: () => fetchMissingRequired(operatingCompanyId as string, entityKind, entityId as string),
    enabled,
    staleTime: 60_000,
  });

  // Never render on loading/error/empty — absence is honest; a false chip is not.
  if (!isSuccess || !data) return null;

  if (data.missing_count === 0) {
    return (
      <span title="All required documents present.">
        <StatusBadge variant="positive">Required docs OK</StatusBadge>
      </span>
    );
  }

  const label = `${data.missing_count} required doc${data.missing_count === 1 ? "" : "s"} missing`;
  return (
    <span title={tooltip(data)}>
      <StatusBadge variant="warn">{label}</StatusBadge>
    </span>
  );
}
