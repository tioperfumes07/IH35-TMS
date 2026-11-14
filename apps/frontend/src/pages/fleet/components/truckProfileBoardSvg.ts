/** Board SVG from docs/design/v3/maintenance-vehicle-graphics/TruckProfile.dc.html (viewBox 0 0 990 520).
 *  Board 44 honesty: the unit number, make/model/year caption, trailer caption and the four numbered
 *  callouts are the REAL unit's — never the board's T177 / Peterbilt / trailer 10202 specimen. */
export type TruckSvgCalloutState = "ok" | "soon" | "defect" | "none";
const CALLOUT_FILL: Record<TruckSvgCalloutState, string> = { ok: "#1F8A4C", soon: "#C76A0A", defect: "#C0262D", none: "#8A97A8" };
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function truckProfileBoardSvgHtml(
  prefix: string,
  opts: { unitNumber?: string; caption?: string; trailerCaption?: string; callouts?: TruckSvgCalloutState[] } = {},
): string {
  const p = prefix.replace(/[^a-zA-Z0-9_-]/g, "") || "u";
  const unit = esc((opts.unitNumber ?? "").slice(0, 10));
  const caption = esc(opts.caption || "Make / model not on file · seen from above, nose right");
  const trailer = esc(opts.trailerCaption || "No trailer attached");
  const c = opts.callouts ?? [];
  const pin = (i: number, d: string, cx: number, cy: number) =>
    c[i] ? `<path d="${d}" stroke="${CALLOUT_FILL[c[i]!]}" stroke-width="2.5"></path><circle cx="${cx}" cy="${cy}" r="17" fill="${CALLOUT_FILL[c[i]!]}"></circle><text x="${cx}" y="${cy + 6}" fill="#FFFFFF">${i + 1}</text>` : "";
  return `<svg width="100%" viewBox="0 0 990 520" role="img" aria-label="${unit || "Truck"} side view with numbered service points">
<defs>
<linearGradient id="${p}-pcab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3DB06E"></stop><stop offset="1" stop-color="#1A7440"></stop></linearGradient>
<linearGradient id="${p}-pbox" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"></stop><stop offset=".6" stop-color="#F1F4F8"></stop><stop offset="1" stop-color="#D6DEE8"></stop></linearGradient>
<linearGradient id="${p}-pchr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FAFCFE"></stop><stop offset=".45" stop-color="#A9B5C3"></stop><stop offset="1" stop-color="#E9EEF3"></stop></linearGradient>
<linearGradient id="${p}-pgls" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#DCEBF8"></stop><stop offset="1" stop-color="#6F97BC"></stop></linearGradient>
<pattern id="${p}-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#EEF2F6" stroke-width="1"></path></pattern>
</defs>
<rect x="0" y="0" width="990" height="520" fill="url(#${p}-grid)"></rect>
<g transform="translate(46 -198) scale(3)"><g transform="rotate(-90 150 160)">
<g>
<ellipse cx="150" cy="160" rx="62" ry="138" fill="#1A2533" opacity=".28"></ellipse>
<rect x="128" y="18" width="7" height="186" rx="2" fill="#1B2533"></rect><rect x="165" y="18" width="7" height="186" rx="2" fill="#1B2533"></rect>
<rect x="128" y="40" width="44" height="5" fill="#1B2533"></rect><rect x="128" y="82" width="44" height="5" fill="#1B2533"></rect>
<rect x="100" y="28" width="28" height="28" rx="5" fill="#141B26"></rect><rect x="172" y="28" width="28" height="28" rx="5" fill="#141B26"></rect>
<rect x="100" y="70" width="28" height="28" rx="5" fill="#141B26"></rect><rect x="172" y="70" width="28" height="28" rx="5" fill="#141B26"></rect>
<path d="M114 30v24M114 72v24M186 30v24M186 72v24" stroke="#3A4658" stroke-width="2"></path>
<rect x="102" y="18" width="22" height="6" rx="2" fill="#2C3A4E"></rect><rect x="176" y="18" width="22" height="6" rx="2" fill="#2C3A4E"></rect>
<circle cx="150" cy="64" r="20" fill="#5D6B7D" stroke="#3A4658" stroke-width="3"></circle><path d="M150 44v14" stroke="#2C3A4E" stroke-width="5"></path>
<rect x="96" y="150" width="16" height="48" rx="8" fill="#C9D2DC" stroke="#8C99AA" stroke-width="1.5"></rect>
<rect x="188" y="150" width="16" height="48" rx="8" fill="#C9D2DC" stroke="#8C99AA" stroke-width="1.5"></rect>
<path d="M98 160h12M98 186h12M190 160h12M190 186h12" stroke="#8C99AA" stroke-width="1.5"></path>
<rect x="111" y="104" width="78" height="58" rx="12" fill="#1F8A4C"></rect>
<rect x="119" y="110" width="62" height="40" rx="8" fill="#FFFFFF" opacity=".14"></rect>
<rect x="113" y="160" width="74" height="40" rx="6" fill="#1F8A4C"></rect>
<rect x="132" y="168" width="36" height="12" rx="3" fill="#FFFFFF" opacity=".2"></rect>
<rect x="98" y="198" width="15" height="7" rx="2" fill="#2C3A4E"></rect><rect x="187" y="198" width="15" height="7" rx="2" fill="#2C3A4E"></rect>
<sc-if value="{{true}}" hint-placeholder-val="{{true}}">
<path d="M116 200h68l-4 14h-60z" fill="#A9C8E3"></path>
<rect x="104" y="232" width="13" height="30" rx="4" fill="#141B26"></rect><rect x="183" y="232" width="13" height="30" rx="4" fill="#141B26"></rect>
<path d="M120 214h60l-3 64c-1 7-6 10-12 10h-30c-6 0-11-3-12-10z" fill="#1F8A4C"></path>
<path d="M150 218v66" stroke="#FFFFFF" stroke-opacity=".25" stroke-width="2"></path>
<rect x="128" y="286" width="44" height="7" rx="3" fill="#D3DBE5"></rect>
<rect x="124" y="276" width="10" height="5" rx="2" fill="#FDE68A"></rect><rect x="166" y="276" width="10" height="5" rx="2" fill="#FDE68A"></rect>
</sc-if>
<sc-if value="{{false}}" hint-placeholder-val="{{false}}">
<path d="M117 200h66l-1 12h-64z" fill="#A9C8E3"></path>
<rect x="102" y="234" width="14" height="30" rx="4" fill="#141B26"></rect><rect x="184" y="234" width="14" height="30" rx="4" fill="#141B26"></rect>
<rect x="119" y="212" width="62" height="72" rx="3" fill="#1F8A4C"></rect>
<path d="M135 214v68M165 214v68" stroke="#FFFFFF" stroke-opacity=".22" stroke-width="2"></path>
<rect x="121" y="282" width="58" height="8" rx="2" fill="#D3DBE5"></rect>
<circle cx="113" cy="276" r="5" fill="#FDE68A" stroke="#B3B9C2" stroke-width="1.5"></circle><circle cx="187" cy="276" r="5" fill="#FDE68A" stroke="#B3B9C2" stroke-width="1.5"></circle>
<rect x="126" y="186" width="5" height="18" rx="2.5" fill="#D3DBE5"></rect><rect x="169" y="186" width="5" height="18" rx="2.5" fill="#D3DBE5"></rect>
</sc-if>
<sc-if value="{{false}}" hint-placeholder-val="{{false}}">
<path d="M114 198h72l-6 24h-60z" fill="#A9C8E3"></path>
<rect x="104" y="232" width="13" height="28" rx="4" fill="#141B26"></rect><rect x="183" y="232" width="13" height="28" rx="4" fill="#141B26"></rect>
<path d="M120 222h60l-3 44c-1 8-7 12-14 12h-26c-7 0-13-4-14-12z" fill="#1F8A4C"></path>
<rect x="129" y="276" width="42" height="7" rx="3" fill="#D3DBE5"></rect>
<path d="M124 264h12M164 264h12" stroke="#FDE68A" stroke-width="4" stroke-linecap="round"></path>
</sc-if>
</g>
</g></g>
${c[3] === "defect" ? `<rect x="226" y="132" width="84" height="84" rx="14" fill="none" stroke="#C0262D" stroke-width="5"></rect>` : ""}
<text x="382" y="291" text-anchor="middle" font-family="Barlow Semi Condensed, Inter, ui-sans-serif, system-ui, sans-serif" font-weight="800" font-size="30" fill="#FFFFFF">${unit}</text>
<g font-family="Barlow Semi Condensed, Inter, ui-sans-serif, system-ui, sans-serif" font-weight="800" font-size="16" text-anchor="middle">
${pin(0, "M766 282 L820 64", 820, 50)}
${pin(1, "M631 282 L630 64", 630, 50)}
${pin(2, "M757 402 L880 476", 880, 490)}
${pin(3, "M268 132 L300 64", 300, 50)}
</g>
<text x="40" y="490" font-family="Barlow Semi Condensed, Inter, ui-sans-serif, system-ui, sans-serif" font-weight="800" font-size="20" fill="#14213D">${caption}</text>
<text x="40" y="512" font-family="Barlow, Inter, ui-sans-serif, system-ui, sans-serif" font-size="14" fill="#5B6B7E">${trailer}</text>
</svg>`;
}
