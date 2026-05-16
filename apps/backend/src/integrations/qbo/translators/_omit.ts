/** Strip keys whose values are null or undefined so QBO never receives explicit nulls. */
export function omitNullish<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}
