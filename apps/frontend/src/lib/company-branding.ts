/** Sidebar / topbar chip colors: TRK (asset) vs DIP Transportation. */
export function companyOperatingChipClasses(legalName: string | null | undefined, code: string | null | undefined): string {
  const u = (legalName ?? "").toUpperCase();
  const c = (code ?? "").toUpperCase();
  if (c === "TRK" || (u.includes("TRUCKING") && !u.includes("TRANSPORTATION"))) {
    return "border border-emerald-400/60 bg-emerald-800/90 text-emerald-50";
  }
  if (c.includes("TRANSP") || u.includes("TRANSPORTATION")) {
    return "border border-amber-400/60 bg-amber-800/90 text-amber-50";
  }
  return "border border-[#6B7280]/50 bg-[#0F1219]/90 text-[#F7F8FA]";
}
