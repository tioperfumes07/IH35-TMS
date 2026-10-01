// ROUND 316 — print designs per contract type. The truck lease and lease-to-own designs already exist
// (truck-lease.template.ts, lease-to-own.template.ts). This adds the TRAILER LEASE (derived from the truck lease so
// both print identically — same stylesheet, same clause structure, trailers instead of trucks) and the customer
// TRANSPORTATION SERVICES AGREEMENT (same stylesheet). Each prints through the existing pipeline: draft preview,
// GET /api/v1/legal/contracts/:id/draft-pdf, send for signature, and the signed PDF stored in documents.attachments
// on completion (contracts.service.ts completePublicSigning). Templates are drafts for the owner's / counsel's
// review (attorney-review flow), not legal advice.
import { TRUCK_LEASE_CONTENT_HTML_EN, TRUCK_LEASE_CONTENT_HTML_ES } from "./truck-lease.template.js";

export type ContractTypeTemplate = {
  code: string;
  nameEn: string;
  nameEs: string;
  category: string;
  htmlEn: string;
  htmlEs: string;
  schema: Record<string, unknown>;
};

/** Pure: derive the trailer lease from the truck lease (same design; vocabulary swapped, mileage column dropped). */
export function deriveTrailerLease(truckHtml: string, lang: "en" | "es"): string {
  const pairs: Array<[RegExp, string]> =
    lang === "en"
      ? [
          [/Commercial Truck Lease Agreement/g, "Commercial Trailer Lease Agreement"],
          [/Leased Vehicles/g, "Leased Trailers"],
          [/per vehicle per month/g, "per trailer per month"],
          [/per month per vehicle/g, "per month per trailer"],
          [/\bvehicles\b/g, "trailers"],
          [/\bvehicle\b/g, "trailer"],
          [/\bVehicles\b/g, "Trailers"],
          [/\bVehicle\b/g, "Trailer"],
          [/\btrucks\b/g, "trailers"],
          [/\btruck\b/g, "trailer"],
          [/\bTruck\b/g, "Trailer"],
          [/\bUnit #/g, "Trailer #"],
        ]
      : [
          [/Contrato de Arrendamiento de Camión Comercial/g, "Contrato de Arrendamiento de Remolque Comercial"],
          [/\bvehículos\b/g, "remolques"],
          [/\bvehículo\b/g, "remolque"],
          [/\bVehículos\b/g, "Remolques"],
          [/\bVehículo\b/g, "Remolque"],
          [/\bcamiones\b/g, "remolques"],
          [/\bcamión\b/g, "remolque"],
          [/\bCamión\b/g, "Remolque"],
        ];
  // Swap vocabulary in the visible text only — never inside <style> or tag attributes (the shared print design
  // keeps its class names, e.g. table.vehicles), so trailer and truck leases print from the identical stylesheet.
  const styleEnd = truckHtml.search(/<\/style>/i);
  const head = styleEnd >= 0 ? truckHtml.slice(0, styleEnd) : "";
  const body = styleEnd >= 0 ? truckHtml.slice(styleEnd) : truckHtml;
  // Tags and {{template tokens}} pass through untouched (the data still binds as `vehicles`, `terms.*`).
  const swapped = body.replace(/(<[^>]*>|\{\{[^}]*\}\})|([^<{]+|\{(?!\{))/g, (_m, tag: string | undefined, text: string | undefined) => {
    if (tag) return tag;
    let t = text ?? "";
    for (const [re, to] of pairs) t = t.replace(re, to);
    return t;
  });
  return head + swapped;
}

function stylesheetOf(html: string): string {
  const m = html.match(/<style[\s\S]*?<\/style>/i);
  return m ? m[0] : "";
}

const SERVICES_EN = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Transportation Services Agreement</title>
${stylesheetOf(TRUCK_LEASE_CONTENT_HTML_EN)}
</head><body>
<h1>Transportation Services Agreement</h1>
<p class="center" style="font-size:9.5pt;color:#555">Reference No. {{terms.reference_no}} &nbsp;|&nbsp; Effective Date: {{terms.effective_date}}</p>
<h2>1. Parties</h2>
<table class="parties"><tr>
  <td><strong>CARRIER:</strong><br/>{{carrier.legal_name}}<br/>{{carrier.address}}<br/>{{carrier.city_state_zip}}<br/>USDOT {{carrier.usdot}} &nbsp; MC {{carrier.mc}}<br/>Attn: {{carrier.contact_name}}, {{carrier.contact_title}}</td>
  <td><strong>CUSTOMER:</strong><br/>{{customer.legal_name}}<br/>{{customer.address}}<br/>{{customer.city_state_zip}}<br/>Attn: {{customer.signer_name}}, {{customer.signer_title}}</td>
</tr></table>
<h2>2. Services</h2>
<p>Carrier shall provide motor carrier transportation of Customer's freight as tendered by Customer and accepted by Carrier. Each shipment is governed by this Agreement and by the rate confirmation and bill of lading issued for it; if they conflict, this Agreement controls unless the rate confirmation expressly states otherwise.</p>
<h2>3. Rates and Accessorials</h2>
<p>Rates are those stated in each rate confirmation, or in Schedule A when attached. Accessorial charges (detention after <strong>{{terms.free_time_hours}}</strong> free hours, layover, lumper, tarp, extra stops) apply as stated in the rate confirmation or Schedule A.</p>
<h2>4. Invoicing and Payment</h2>
<p>Carrier shall invoice each shipment upon delivery with proof of delivery. Customer shall pay within <strong>{{terms.payment_terms_days}}</strong> days of invoice. Carrier may assign its receivables to a factoring company; Customer shall honor a notice of assignment and remit to the assignee named in it.</p>
<h2>5. Cargo Liability</h2>
<p>Carrier's liability for loss of or damage to cargo is governed by 49 U.S.C. § 14706 and limited to <strong>{{terms.cargo_limit_display}}</strong> per shipment unless a higher value is declared in writing before tender and the corresponding charge is agreed. Claims must be filed in writing within nine (9) months of delivery.</p>
<h2>6. Insurance</h2>
<p>Carrier shall maintain auto liability of not less than <strong>{{terms.auto_liability_display}}</strong> and cargo insurance of not less than <strong>{{terms.cargo_insurance_display}}</strong>, and shall provide certificates on request.</p>
<h2>7. Independent Contractor</h2>
<p>Carrier is an independent contractor with exclusive control of its drivers, equipment and operations, and is solely responsible for compliance with FMCSA and all applicable safety regulations.</p>
<h2>8. Term and Termination</h2>
<p>This Agreement begins on the Effective Date and continues for <strong>{{terms.term_months}}</strong> months, renewing automatically for like periods, unless either party gives <strong>{{terms.termination_notice_days}}</strong> days' written notice. Termination does not affect shipments already tendered or amounts already owed.</p>
<h2>9. Governing Law</h2>
<p>This Agreement is governed by the laws of the State of <strong>{{terms.governing_law}}</strong>, without regard to conflict-of-law principles, and federal law where it applies. Venue lies in <strong>{{terms.venue_county}} County, {{terms.governing_law}}</strong>.</p>
<h2>10. Entire Agreement</h2>
<p>This Agreement, with its schedules and the rate confirmations issued under it, is the entire agreement of the parties and may be amended only in a writing signed by both.</p>
<div class="sig-block"><table class="parties"><tr>
  <td><p><strong>CARRIER:</strong> {{carrier.legal_name}}</p><div class="sig-line">{{carrier.contact_name}}, {{carrier.contact_title}}</div><p>Date: ____________</p></td>
  <td><p><strong>CUSTOMER:</strong> {{customer.legal_name}}</p><div class="sig-line">{{customer.signer_name}}, {{customer.signer_title}}</div><p>Date: ____________</p></td>
</tr></table></div>
</body></html>`;

export const CONTRACT_TYPE_TEMPLATES: Record<string, ContractTypeTemplate> = {
  trailer_lease: {
    code: "trailer_lease",
    nameEn: "Commercial Trailer Lease Agreement",
    nameEs: "Contrato de Arrendamiento de Remolque Comercial",
    category: "vehicle_lease",
    htmlEn: deriveTrailerLease(TRUCK_LEASE_CONTENT_HTML_EN, "en"),
    htmlEs: deriveTrailerLease(TRUCK_LEASE_CONTENT_HTML_ES, "es"),
    schema: {},
  },
  transportation_services_agreement: {
    code: "transportation_services_agreement",
    nameEn: "Transportation Services Agreement",
    nameEs: "Contrato de Servicios de Transporte",
    category: "customer_contract",
    htmlEn: SERVICES_EN,
    htmlEs: SERVICES_EN,
    schema: {},
  },
};
