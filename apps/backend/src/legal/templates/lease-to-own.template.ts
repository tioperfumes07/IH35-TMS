// LEGAL-CONTRACT-CREATOR-01 — canonical Lease-to-Own template (seeded into legal.contract_templates).
//
// The article text is VERBATIM from Jorge's approved prototype ("2026 06 25  Truck lease.docx"); only the
// deal-specific values are Handlebars placeholders (the existing legal module renders with Handlebars via
// pdf-renderer.service.ts -> renderTemplate). Do NOT re-draft the legal language here — edits to wording go
// through legal review and a new template VERSION (legal.contract_templates is versioned). Stored as
// content_html_en; content_html_es duplicates the English text for now (the table requires it NOT NULL — a
// Spanish translation is a future versioned task, not in scope: don't machine-translate legal text).
//
// filled_variables shape the creator writes (jsonb on legal.contract_instances):
//   { seller:{company_id,legal_name,address}, lessee:{name,entity_type,signer,title,address},
//     terms:{term_months,use_charge_pct,governing_law,venue_county,execution_date,reference_no,truck_count},
//     vehicles:[{unit_id,owner_company_id,owner_label,unit_number,year,make,model,vin,lienholder,
//                balance_owed,monthly_lease_amount,payment_due_date,sort_order}] }

export const LEASE_TO_OWN_TEMPLATE_CODE = "lease_to_own";
export const LEASE_TO_OWN_DISPLAY_NAME_EN = "Lease-to-Own Asset Acquisition Agreement (with Option to Purchase)";
export const LEASE_TO_OWN_DISPLAY_NAME_ES = "Acuerdo de Adquisición de Activos en Arrendamiento con Opción de Compra";
export const LEASE_TO_OWN_CATEGORY = "asset_acquisition";

// permissive (the creator UI enforces required fields); kept '{}' so createContractInstance does not
// reject partial drafts. Documented shape lives in the comment above.
export const LEASE_TO_OWN_VARIABLE_SCHEMA: Record<string, unknown> = {};

export const LEASE_TO_OWN_CONTENT_HTML_EN = `
<h1 style="text-align:center">LEASE TO OWN ASSET ACQUISITION AGREEMENT</h1>
<h2 style="text-align:center">WITH OPTION TO PURCHASE</h2>

<p>This agreement between {{seller.legal_name}} (&ldquo;Seller&rdquo;) and {{lessee.name}} (&ldquo;Buyer&rdquo;) (the &ldquo;Agreement&rdquo;) (&ldquo;Seller&rdquo; and &ldquo;Buyer&rdquo; are sometimes collectively referred to herein as the &ldquo;Parties&rdquo;) establishes a long-term lease-to-own asset acquisition arrangement involving {{terms.truck_count}} commercial motor vehicles (the &ldquo;Trucks&rdquo;).</p>

<p><strong>Purpose:</strong> The Parties intend for Buyer to operate the Trucks under its own insurance and permits, at its own expense, and to reimburse Seller for the use of the Trucks and to establish the payment obligation for the purchase of the Trucks at the end of the lease. Upon payment of all amounts required herein, Seller will transfer title to the Trucks to Buyer.</p>

<p>The transaction is strictly a lease purchase acquisition agreement with an option to purchase for the use and eventual purchase of the Trucks. Neither Seller nor Buyer will acquire any interest in each other as a result of this Agreement.</p>

<p><strong>Identification of Trucks and Lease to Purchase Terms:</strong> Attached hereto and incorporated herein by reference is a term sheet identified as Exhibit A which identifies each Truck subject to this Agreement with (1) the make, model and year; (2) the Vehicle Identification Number; (3) the name of the current lienholder (if any); (4) the balance owed to the lienholder; (5) the monthly lease payment amount required herein, exclusive of a use charge; (6) the due date of each monthly payment for each Truck.</p>

<p>In addition to the monthly payment provided in the preceding paragraph, Buyer will pay monthly to the Seller a fee equal to {{terms.use_charge_pct}}% of the amounts invoiced to third parties for loads hauled by each Truck.</p>

<p>At the conclusion of the Lease Term Buyer may purchase a Truck subject to this Agreement by paying to Seller the then fair market value of the Truck. Seller, on receipt of this amount, will transfer title to the Truck to the Buyer.</p>

<p><strong>Lease Term:</strong> The lease term is {{terms.term_months}} months from the date this Agreement is executed by both parties. Buyer will make the monthly lease payment for each Truck stated in Exhibit A for {{terms.term_months}} months.</p>

<p><strong>Buyer&rsquo;s Right of Inspection:</strong> Buyer may inspect all assets, maintenance records, ECM data, title records, payoff balances, and lender documentation before acceptance of this Agreement.</p>

<p><strong>Acceptance and Inclusion of Truck in Agreement:</strong> Each Truck shall be individually accepted with a written Asset Acceptance Certificate.</p>

<p><strong>Right to Purchase Trucks Singly:</strong> Buyer may purchase each Truck individually upon the conclusion of its respective Lease Term and the payment of all consideration required herein. Seller will deliver a clean (without liens) certificate of title to Buyer upon the payment of the consideration.</p>

<p>Seller represents that it has the legal right to enter into this Agreement and authority to enter this contract.</p>
<p>Buyer represents that it has the legal right to enter into this Agreement and authority to enter this contract.</p>
<p>All liens on the Trucks have been disclosed in Exhibit A.</p>

<p><strong>Insurance:</strong> Buyer will maintain required insurance from the execution date of this Agreement on all of the Trucks, including liability and physical damage insurance in amounts sufficient to protect the Seller from claims resulting from the use of the Trucks and physical loss experienced by the trucks. The liability insurance will name the Seller as an additional insured in the event a Truck is involved in an accident with coverage of at least $1,000,000 per occurrence. The physical damage policy will name the Seller as a loss payee for replacement value as the owner of the truck. Buyer will provide proof of insurance to the Seller upon written request.</p>

<p>Failure to maintain insurance will be an event of default immediately canceling the Buyer&rsquo;s right to possess or use the Trucks. Buyer will immediately surrender the Trucks to Seller upon such a default.</p>

<p><strong>Maintenance:</strong> The obligation to maintain the Trucks will become the Buyer&rsquo;s obligation upon the execution of this Agreement. Seller has the right to inspect the Trucks upon one days written request and will have access to maintenance logs, the right to inspect, and GPS access to the location of the trucks until Buyer fulfils all of its obligations under this Agreement.</p>

<p>If Buyer fails to maintain a Truck, Seller may give Buyer ten days&rsquo; written notice of default in which to cure the maintenance default. If the default is not cured in the ten day period, Seller may send a written notice to Buyer cancelling the Buyer&rsquo;s right to possess or use the truck subject to the notice of default. Buyer will immediately surrender the Truck to Seller.</p>

<p><strong>Assignability:</strong> All obligations contained herein are binding on Seller&rsquo;s and Buyer&rsquo;s successors and assigns.</p>

<p><strong>Covenant Against Encumbering:</strong> Neither Seller nor Buyer may sell, refinance, transfer, pledge, collateralize, or otherwise further encumber the Trucks which are the subject of this Agreement.</p>

<p><strong>Remedies:</strong> Except for the failure to maintain the Trucks or keep them insured, a breach of this Agreement will entitle the non-defaulting party to seek damages, specific performance, and or equitable relief, and attorneys&rsquo; fees if allowed under applicable law.</p>

<p><strong>Indemnity:</strong> Buyer agrees to indemnify and hold the Seller harmless from any and all claims arising or incurred from the operation of the Trucks while the Trucks are subject to this Agreement.</p>

<p><strong>Choice of Law and Venue:</strong> The parties agree that {{terms.governing_law}} law governs this Agreement, and the exclusive venue for a lawsuit to enforce this contract is {{terms.venue_county}} County, {{terms.governing_law}}.</p>

<h2 style="text-align:center">EXHIBIT A &mdash; TERM SHEET</h2>
<table border="1" cellspacing="0" cellpadding="6" style="width:100%;border-collapse:collapse">
  <thead>
    <tr>
      <th>Make / Model / Year</th><th>VIN</th><th>Lienholder</th>
      <th>Balance Owed</th><th>Monthly Lease Payment</th><th>Payment Due Date</th>
    </tr>
  </thead>
  <tbody>
    {{#each vehicles}}
    <tr>
      <td>{{this.make}} {{this.model}} {{this.year}}</td>
      <td>{{this.vin}}</td>
      <td>{{this.lienholder}}</td>
      <td>{{this.balance_owed}}</td>
      <td>{{this.monthly_lease_amount}}</td>
      <td>{{this.payment_due_date}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>

<div style="margin-top:32px">
  <p><strong>SELLER</strong><br/>{{seller.legal_name}}</p>
  <p>By: _______________________<br/>{{seller.signer_name}}<br/>{{seller.signer_title}}</p>

  <p style="margin-top:24px"><strong>BUYER</strong><br/>{{lessee.name}}</p>
  <p>By: _______________________<br/>{{lessee.signer}}<br/>{{lessee.title}}</p>
</div>

<div style="margin-top:32px">
  <p>STATE OF {{terms.governing_law}}</p>
  <p>COUNTY OF {{terms.venue_county}}</p>
  <p>Acknowledged before me the undersigned authority on this ___ day of ______, {{terms.execution_year}} by {{seller.signer_name}}, {{seller.signer_title}} for {{seller.legal_name}}, a {{terms.governing_law}} Limited Liability Company on behalf of such limited liability company.</p>
  <p style="text-align:right">________________________________<br/>NOTARY PUBLIC STATE OF {{terms.governing_law}}</p>

  <p style="margin-top:24px">STATE OF {{terms.governing_law}}</p>
  <p>COUNTY OF {{terms.venue_county}}</p>
  <p>Acknowledged before me the undersigned authority on this ___ day of ______, {{terms.execution_year}} by {{lessee.signer}}, {{lessee.title}} of {{lessee.name}}, a {{terms.governing_law}} {{lessee.entity_type}} on behalf of said entity.</p>
  <p style="text-align:right">________________________________<br/>NOTARY PUBLIC STATE OF {{terms.governing_law}}</p>
</div>
`.trim();

// content_html_es is NOT NULL in the table; reuse the English body until a reviewed Spanish version exists.
export const LEASE_TO_OWN_CONTENT_HTML_ES = LEASE_TO_OWN_CONTENT_HTML_EN;
