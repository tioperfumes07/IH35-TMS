/**
 * UTF-8 bytes decoded as Latin-1 show up as Ã© / Â´.
 * QBO JSON is UTF-8; this class comes from CSV/Excel and TRANSP copies of already-broken names.
 */
export function repairUtf8Mojibake(value: string): string {
  const text = value.trim();
  if (!/Ã.|Â./.test(text)) return text;
  try {
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    if (repaired.includes("\uFFFD") || repaired.length === 0) return text;
    return repaired;
  } catch {
    return text;
  }
}
