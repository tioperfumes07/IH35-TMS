// U12 (owner UI register 2026-10-03) — "status is a multi-selector everywhere". Every status filter that became
// multi-select sends its picks as a repeated query param (?status=a&status=b); the backend reads it with
// lib/status-list.ts (statusListParam / statusListCondition). An empty pick sends nothing (= no filter).
export function appendStatusList(q: URLSearchParams, key: string, statuses: string | readonly string[] | null | undefined) {
  const list = Array.isArray(statuses) ? statuses : statuses ? [statuses as string] : [];
  for (const s of list) if (s) q.append(key, s);
}

/** Status options for MultiSelectDropdown from a value -> label map, in the map's order. */
export function statusOptions(labels: Readonly<Record<string, string>>): Array<{ value: string; label: string }> {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}
