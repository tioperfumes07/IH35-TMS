/**
 * ROUND 443.245 / 443.248 — one body-style mapping for every TractorTopView.
 * Source: ~/Downloads/10-22-2026-LEAD-MAINT-DESIGN-Main.dc.html `styleOf`.
 *   /389/ → classic · /VOLVO|CASCADIA/ → sloped · else aero
 */
export type TractorBodyStyle = "aero" | "classic" | "sloped";

export function bodyStyleFromMakeModel(make?: string | null, model?: string | null): TractorBodyStyle {
  const mk = `${make ?? ""} ${model ?? ""}`.toUpperCase();
  if (/389/.test(mk)) return "classic";
  if (/VOLVO|CASCADIA/.test(mk)) return "sloped";
  return "aero";
}
