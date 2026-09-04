// B-A1 — HONEST entity-aware empty-state. A bare "0 / No records yet" reads as a bug when the real reason is
// that the SELECTED entity legitimately has no data (e.g. USMCA, launched 2026-07-15, before it has activity)
// while another entity (TRANSP/TRK) holds the rows. This names the entity and points at the entity switcher so
// an empty view can't be misread as a broken query. Palette-locked, additive, no emoji.
export function EntityEmptyState({
  entityName,
  noun = "records",
}: {
  entityName?: string | null;
  noun?: string;
}) {
  const who = entityName?.trim() || "This entity";
  return (
    <p className="px-3 py-3 text-xs text-gray-500">
      {who} has no {noun} yet. If you expected data here, switch entity from the top bar — another company may hold it.
    </p>
  );
}
