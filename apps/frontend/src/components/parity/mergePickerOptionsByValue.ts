export type PickerOptionWithValue = { value: string };

/**
 * Merge a canonical server roster with locally-created optimistic rows by canonical id.
 *
 * The first collection wins so a refetched server row replaces its optimistic twin with the
 * canonical label/type. This also guarantees one React key and one selectable row per FK.
 */
export function mergePickerOptionsByValue<T extends PickerOptionWithValue>(
  canonical: readonly T[],
  optimistic: readonly T[],
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const option of [...canonical, ...optimistic]) {
    if (seen.has(option.value)) continue;
    seen.add(option.value);
    merged.push(option);
  }
  return merged;
}
