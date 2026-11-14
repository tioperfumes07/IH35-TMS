/**
 * Board 23 (docs/design/v3/Maintenance-InShop.dc.html) — the three top-view trucks the board draws, verbatim. The cab
 * colour follows the bay state (#A15C0B waiting parts, #1E3A5F otherwise), exactly as the board colours them.
 */
export type InShopTruckShape = "aero" | "classic" | "cabover";

/** Cab shape from make/model: Peterbilt 389 / 379 / Kenworth W900 long-hood = classic; Volvo, Mack, International =
 *  the board's third drawing; everything else (Peterbilt 579, Freightliner, Kenworth T680) = aero. */
export function inShopTruckShape(make: string | null | undefined, model: string | null | undefined): InShopTruckShape {
  const m = `${make ?? ""} ${model ?? ""}`.toUpperCase();
  if (/\b389\b|\bW900\b|\b379\b/.test(m)) return "classic";
  if (/VOLVO|MACK|INTERNATIONAL|NAVISTAR/.test(m)) return "cabover";
  return "aero";
}

export function InShopTruck({ shape, color }: { shape: InShopTruckShape; color: string }) {
  const c = color;
  return (
    <svg width="100%" viewBox="60 0 180 300" role="img" aria-label={`${shape} truck`}><g>
      {shape === "aero" ? <>
<rect x="128" y="18" width="7" height="186" rx="2" fill="#1B2533" /><rect x="165" y="18" width="7" height="186" rx="2" fill="#1B2533" />
<rect x="128" y="40" width="44" height="5" fill="#1B2533" /><rect x="128" y="82" width="44" height="5" fill="#1B2533" />
<rect x="100" y="28" width="28" height="28" rx="5" fill="#141B26" /><rect x="172" y="28" width="28" height="28" rx="5" fill="#141B26" />
<rect x="100" y="70" width="28" height="28" rx="5" fill="#141B26" /><rect x="172" y="70" width="28" height="28" rx="5" fill="#141B26" />
<path d="M114 30v24M114 72v24M186 30v24M186 72v24" stroke="#3A4658" strokeWidth="2" />
<rect x="102" y="18" width="22" height="6" rx="2" fill="#2C3A4E" /><rect x="176" y="18" width="22" height="6" rx="2" fill="#2C3A4E" />
<circle cx="150" cy="64" r="20" fill="#5D6B7D" stroke="#3A4658" strokeWidth="3" /><path d="M150 44v14" stroke="#2C3A4E" strokeWidth="5" />
<rect x="96" y="150" width="16" height="48" rx="8" fill="#C9D2DC" stroke="#8C99AA" strokeWidth="1.5" />
<rect x="188" y="150" width="16" height="48" rx="8" fill="#C9D2DC" stroke="#8C99AA" strokeWidth="1.5" />
<path d="M98 160h12M98 186h12M190 160h12M190 186h12" stroke="#8C99AA" strokeWidth="1.5" />
<rect x="111" y="104" width="78" height="58" rx="12" fill={c} />
<rect x="119" y="110" width="62" height="40" rx="8" fill="#FFFFFF" opacity=".14" />
<rect x="113" y="160" width="74" height="40" rx="6" fill={c} />
<rect x="132" y="168" width="36" height="12" rx="3" fill="#FFFFFF" opacity=".2" />
<rect x="98" y="198" width="15" height="7" rx="2" fill="#2C3A4E" /><rect x="187" y="198" width="15" height="7" rx="2" fill="#2C3A4E" />
<path d="M116 200h68l-4 14h-60z" fill="#A9C8E3" />
<rect x="104" y="232" width="13" height="30" rx="4" fill="#141B26" /><rect x="183" y="232" width="13" height="30" rx="4" fill="#141B26" />
<path d="M120 214h60l-3 64c-1 7-6 10-12 10h-30c-6 0-11-3-12-10z" fill={c} />
<path d="M150 218v66" stroke="#FFFFFF" strokeOpacity=".25" strokeWidth="2" />
<rect x="128" y="286" width="44" height="7" rx="3" fill="#D3DBE5" />
<rect x="124" y="276" width="10" height="5" rx="2" fill="#FDE68A" /><rect x="166" y="276" width="10" height="5" rx="2" fill="#FDE68A" />
      </> : shape === "classic" ? <>
<rect x="128" y="18" width="7" height="186" rx="2" fill="#1B2533" /><rect x="165" y="18" width="7" height="186" rx="2" fill="#1B2533" />
<rect x="128" y="40" width="44" height="5" fill="#1B2533" /><rect x="128" y="82" width="44" height="5" fill="#1B2533" />
<rect x="100" y="28" width="28" height="28" rx="5" fill="#141B26" /><rect x="172" y="28" width="28" height="28" rx="5" fill="#141B26" />
<rect x="100" y="70" width="28" height="28" rx="5" fill="#141B26" /><rect x="172" y="70" width="28" height="28" rx="5" fill="#141B26" />
<path d="M114 30v24M114 72v24M186 30v24M186 72v24" stroke="#3A4658" strokeWidth="2" />
<rect x="102" y="18" width="22" height="6" rx="2" fill="#2C3A4E" /><rect x="176" y="18" width="22" height="6" rx="2" fill="#2C3A4E" />
<circle cx="150" cy="64" r="20" fill="#5D6B7D" stroke="#3A4658" strokeWidth="3" /><path d="M150 44v14" stroke="#2C3A4E" strokeWidth="5" />
<rect x="96" y="150" width="16" height="48" rx="8" fill="#C9D2DC" stroke="#8C99AA" strokeWidth="1.5" />
<rect x="188" y="150" width="16" height="48" rx="8" fill="#C9D2DC" stroke="#8C99AA" strokeWidth="1.5" />
<path d="M98 160h12M98 186h12M190 160h12M190 186h12" stroke="#8C99AA" strokeWidth="1.5" />
<rect x="111" y="104" width="78" height="58" rx="12" fill={c} />
<rect x="119" y="110" width="62" height="40" rx="8" fill="#FFFFFF" opacity=".14" />
<rect x="113" y="160" width="74" height="40" rx="6" fill={c} />
<rect x="132" y="168" width="36" height="12" rx="3" fill="#FFFFFF" opacity=".2" />
<rect x="98" y="198" width="15" height="7" rx="2" fill="#2C3A4E" /><rect x="187" y="198" width="15" height="7" rx="2" fill="#2C3A4E" />
<path d="M117 200h66l-1 12h-64z" fill="#A9C8E3" />
<rect x="102" y="234" width="14" height="30" rx="4" fill="#141B26" /><rect x="184" y="234" width="14" height="30" rx="4" fill="#141B26" />
<rect x="119" y="212" width="62" height="72" rx="3" fill={c} />
<path d="M135 214v68M165 214v68" stroke="#FFFFFF" strokeOpacity=".22" strokeWidth="2" />
<rect x="121" y="282" width="58" height="8" rx="2" fill="#D3DBE5" />
<circle cx="113" cy="276" r="5" fill="#FDE68A" stroke="#B3B9C2" strokeWidth="1.5" /><circle cx="187" cy="276" r="5" fill="#FDE68A" stroke="#B3B9C2" strokeWidth="1.5" />
<rect x="126" y="186" width="5" height="18" rx="2.5" fill="#D3DBE5" /><rect x="169" y="186" width="5" height="18" rx="2.5" fill="#D3DBE5" />
      </> : <>
<rect x="128" y="18" width="7" height="186" rx="2" fill="#1B2533" /><rect x="165" y="18" width="7" height="186" rx="2" fill="#1B2533" />
<rect x="128" y="40" width="44" height="5" fill="#1B2533" /><rect x="128" y="82" width="44" height="5" fill="#1B2533" />
<rect x="100" y="28" width="28" height="28" rx="5" fill="#141B26" /><rect x="172" y="28" width="28" height="28" rx="5" fill="#141B26" />
<rect x="100" y="70" width="28" height="28" rx="5" fill="#141B26" /><rect x="172" y="70" width="28" height="28" rx="5" fill="#141B26" />
<path d="M114 30v24M114 72v24M186 30v24M186 72v24" stroke="#3A4658" strokeWidth="2" />
<rect x="102" y="18" width="22" height="6" rx="2" fill="#2C3A4E" /><rect x="176" y="18" width="22" height="6" rx="2" fill="#2C3A4E" />
<circle cx="150" cy="64" r="20" fill="#5D6B7D" stroke="#3A4658" strokeWidth="3" /><path d="M150 44v14" stroke="#2C3A4E" strokeWidth="5" />
<rect x="96" y="150" width="16" height="48" rx="8" fill="#C9D2DC" stroke="#8C99AA" strokeWidth="1.5" />
<rect x="188" y="150" width="16" height="48" rx="8" fill="#C9D2DC" stroke="#8C99AA" strokeWidth="1.5" />
<path d="M98 160h12M98 186h12M190 160h12M190 186h12" stroke="#8C99AA" strokeWidth="1.5" />
<rect x="111" y="104" width="78" height="58" rx="12" fill={c} />
<rect x="119" y="110" width="62" height="40" rx="8" fill="#FFFFFF" opacity=".14" />
<rect x="113" y="160" width="74" height="40" rx="6" fill={c} />
<rect x="132" y="168" width="36" height="12" rx="3" fill="#FFFFFF" opacity=".2" />
<rect x="98" y="198" width="15" height="7" rx="2" fill="#2C3A4E" /><rect x="187" y="198" width="15" height="7" rx="2" fill="#2C3A4E" />
<path d="M114 198h72l-6 24h-60z" fill="#A9C8E3" />
<rect x="104" y="232" width="13" height="28" rx="4" fill="#141B26" /><rect x="183" y="232" width="13" height="28" rx="4" fill="#141B26" />
<path d="M120 222h60l-3 44c-1 8-7 12-14 12h-26c-7 0-13-4-14-12z" fill={c} />
<rect x="129" y="276" width="42" height="7" rx="3" fill="#D3DBE5" />
<path d="M124 264h12M164 264h12" stroke="#FDE68A" strokeWidth="4" strokeLinecap="round" />
      </>}
    </g></svg>
  );
}
