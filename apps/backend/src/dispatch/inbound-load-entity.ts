/**
 * ROUND 326 (CC-1) — INBOUND LOAD ENTITY RESOLUTION. The 2026-09-23/24 AlwaysTrack import booked 21 IH 35 TRANSPORTATION
 * loads under USMCA (and R160 did the same to 13 before it): an imported load took the operating company the caller
 * happened to pass — a hardcoded USMCA id in the ops script — because nothing compared it with the company the SOURCE
 * names. The AlwaysTrack letterhead cannot decide it (USMCA shares IH35 Transportation's AlwaysTrack account, so every
 * document prints "IH35 Transportation, LLC"); the owner's discriminator is the Faro "Company" column (IH = TRANSP).
 *
 * Rule (pure): an imported load (historical import, or any inbound_source) must carry the company its source names;
 * it books only under that same company. No company named -> rejected "inbound_load_entity_unresolved"; a different
 * company -> rejected "inbound_load_entity_mismatch". Never a default, never the session company.
 */
export type CompanyCode = "TRANSP" | "TRK" | "USMCA";
export type InboundSource = { system: "alwaystrack" | "faro" | "csv" | "manual_import"; company_code?: CompanyCode | null; reference?: string | null };

/** Pure: the owner's Faro "Company" column -> company code (IH = IH 35 TRANSPORTATION). Unknown -> null. */
export function companyCodeFromFaroCompany(value: string | null | undefined): CompanyCode | null {
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "IH" || v === "IH35" || v === "TRANSP" || /IH ?35 TRANSPORTATION/.test(v)) return "TRANSP";
  if (v === "USMCA" || /USMCA/.test(v)) return "USMCA";
  if (v === "TRK" || /IH ?35 TRUCKING/.test(v)) return "TRK";
  return null;
}

export type InboundEntityDecision =
  | { ok: true; source_entity_code: CompanyCode | null }
  | { ok: false; error: "inbound_load_entity_unresolved" | "inbound_load_entity_mismatch"; message: string };

/** Pure: decide whether this booking may proceed under the target company. */
export function resolveInboundLoadEntity(args: { targetCompanyCode: string | null; isImport: boolean; source?: InboundSource | null }): InboundEntityDecision {
  if (!args.isImport && !args.source) return { ok: true, source_entity_code: null };
  const named = args.source?.company_code ?? null;
  if (!named) {
    return { ok: false, error: "inbound_load_entity_unresolved", message: "An imported load must name the company its source (Faro Company column / AlwaysTrack account) belongs to — it is never assigned by default." };
  }
  if (!args.targetCompanyCode || named !== args.targetCompanyCode) {
    return { ok: false, error: "inbound_load_entity_mismatch", message: `The source names ${named}; this load cannot be booked under ${args.targetCompanyCode ?? "an unknown company"}.` };
  }
  return { ok: true, source_entity_code: named };
}
