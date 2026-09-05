export const IH35_SAMSARA_EXTERNAL_ID_KEYS = [
  "ih35Driver",
  "ih35Unit",
  "ih35Trailer",
  "ih35Load",
  "ih35Stop",
  "ih35Site",
] as const;

export type Ih35SamsaraExternalIdKey = (typeof IH35_SAMSARA_EXTERNAL_ID_KEYS)[number];
export type Ih35SamsaraExternalIds = Partial<Record<Ih35SamsaraExternalIdKey, string>>;

/**
 * Canonical IH35 correlation identifiers for every Samsara object we create.
 * Callers provide only the local entities represented by that remote object;
 * empty values are rejected instead of emitting an uncorrelatable create.
 */
export function buildIh35SamsaraExternalIds(input: Ih35SamsaraExternalIds): Record<string, string> {
  const entries = IH35_SAMSARA_EXTERNAL_ID_KEYS.flatMap((key) => {
    const value = input[key]?.trim();
    return value ? [[key, value] as const] : [];
  });
  if (entries.length === 0) throw new Error("samsara_external_ids_required");
  return Object.fromEntries(entries);
}
