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
  // `summary.required` is typed as present, but the value arrives from an API response and a payload
  // without it (an error shape, an older server, a partial cache hydrate) makes `.filter` throw. This
  // chip renders inside fleet/asset/vehicle profile pages, so the throw does not degrade a badge — it
  // unmounts the whole page to the router ErrorBoundary. Treating an absent list as "nothing required"
  // keeps the page alive and is the same reading a caller would give an empty array.
  const missing = (summary.required ?? []).filter((r) => !r.satisfied);
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
  const query = useQuery({
    queryKey: ["missing-required", entityKind, entityId, operatingCompanyId],
    queryFn: () => fetchMissingRequired(operatingCompanyId as string, entityKind, entityId as string),
    enabled,
    staleTime: 60_000,
  });

  // FLEET-F6062: absence while loading is honest, but absence after a failed canonical GET hides a
  // compliance outage. Keep the profile header compact while exposing exact recovery and never
  // painting a false green "Required docs OK" state.
  if (query.isError) {
    return (
      <button
        type="button"
        role="alert"
        title={(query.error as Error)?.message ?? "Required-document status could not be loaded."}
        onClick={() => void query.refetch()}
      >
        <StatusBadge variant="warn">Required docs unavailable · Retry</StatusBadge>
      </button>
    );
  }
  if (!query.isSuccess || !query.data) return null;

  const data = query.data;

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
