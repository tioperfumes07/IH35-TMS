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
  return "border border-slate-500/50 bg-slate-800/90 text-slate-100";
}
