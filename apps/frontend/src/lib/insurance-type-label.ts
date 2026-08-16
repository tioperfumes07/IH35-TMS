/**
 * Render insurance coverage identity for operators while preserving the canonical code for writes.
 * Prefer the catalog name returned by a company-scoped read; the fallback is humanized and never
 * exposes storage syntax such as `auto_liability`.
 */
export function insuranceTypeLabel(code: string | null | undefined, catalogName?: string | null): string {
  const canonical = catalogName?.trim();
  if (canonical) return canonical;
  if (!code?.trim()) return "Coverage type unavailable";
  return code
    .trim()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
