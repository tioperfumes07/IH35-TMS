// LEGAL-TRUCK-LEASE-01 — canonical Truck Lease Agreement template (pure operating lease).
//
// Distinct from lease-to-own (template_code='lease_to_own'): this is a fixed-term operating
// lease with no purchase option. Entity-scoped to TRANSP (seeded on-demand via ensureTruckLeaseTemplate).
//
// Variables shape (jsonb on legal.contract_instances.filled_variables):
//   {
//     lessor: { legal_name, address, city_state_zip, contact_name, contact_title, contact_email },
//     lessee: { legal_name, entity_type, address, city_state_zip, signer_name, signer_title, signer_email },
//     terms: {
//       execution_date, start_date, end_date, term_months,
//       monthly_lease_amount_cents, payment_due_day,     // integer cents
//       security_deposit_cents,                          // integer cents, 0 if none
//       late_fee_cents, late_fee_grace_days,
//       governing_law, venue_county, reference_no,
//       escrow_agent_name, escrow_amount_cents,          // "Escrow" not "Forfeitures"
//     },
//     vehicles: [{
//       sort_order, unit_number, year, make, model, vin,
//       lienholder, permitted_use, mileage_limit_annual
//     }]
//   }

export const TRUCK_LEASE_TEMPLATE_CODE = "truck_lease";
export const TRUCK_LEASE_DISPLAY_NAME_EN = "Commercial Truck Lease Agreement";
export const TRUCK_LEASE_DISPLAY_NAME_ES = "Contrato de Arrendamiento de Camión Comercial";
export const TRUCK_LEASE_CATEGORY = "vehicle_lease";
export const TRUCK_LEASE_VARIABLE_SCHEMA: Record<string, unknown> = {};

export const TRUCK_LEASE_CONTENT_HTML_EN = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<style>
  body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.55;color:#111;margin:0;padding:0}
  h1{font-size:14pt;text-align:center;text-transform:uppercase;letter-spacing:.08em;margin:0 0 4px}
  h2{font-size:11pt;text-transform:uppercase;letter-spacing:.05em;margin:18px 0 6px;border-bottom:1px solid #999;padding-bottom:2px}
  .center{text-align:center} .right{text-align:right}
  table.parties{width:100%;border-collapse:collapse;margin:8px 0}
  table.parties td{vertical-align:top;padding:4px 10px 4px 0;width:50%}
  table.vehicles{width:100%;border-collapse:collapse;font-size:9.5pt;margin:8px 0}
  table.vehicles th{background:#f0f0f0;padding:4px 6px;text-align:left;border:1px solid #ccc}
  table.vehicles td{padding:4px 6px;border:1px solid #ccc}
  .sig-block{margin-top:40px;display:flex;gap:60px}
  .sig-line{border-top:1px solid #333;margin-top:36px;font-size:9pt;color:#555;padding-top:4px}
  p{margin:6px 0}
</style>
</head>
<body>
<h1>Commercial Truck Lease Agreement</h1>
<p class="center" style="font-size:9.5pt;color:#555">Reference No. {{terms.reference_no}} &nbsp;|&nbsp; Execution Date: {{terms.execution_date}}</p>

<h2>1. Parties</h2>
<table class="parties"><tr>
  <td><strong>LESSOR:</strong><br/>{{lessor.legal_name}}<br/>{{lessor.address}}<br/>{{lessor.city_state_zip}}<br/>Attn: {{lessor.contact_name}}, {{lessor.contact_title}}</td>
  <td><strong>LESSEE:</strong><br/>{{lessee.legal_name}} {{lessee.entity_type}}<br/>{{lessee.address}}<br/>{{lessee.city_state_zip}}<br/>Attn: {{lessee.signer_name}}, {{lessee.signer_title}}</td>
</tr></table>

<h2>2. Leased Vehicles</h2>
<p>Lessor hereby leases to Lessee, and Lessee hereby leases from Lessor, the commercial motor vehicles identified below (collectively, the "<strong>Equipment</strong>"):</p>
<table class="vehicles">
  <thead><tr><th>#</th><th>Unit</th><th>Year</th><th>Make / Model</th><th>VIN</th><th>Lienholder</th><th>Permitted Use</th><th>Annual Mi. Limit</th></tr></thead>
  <tbody>
  {{#each vehicles}}
  <tr>
    <td>{{sort_order}}</td><td>{{unit_number}}</td><td>{{year}}</td>
    <td>{{make}} {{model}}</td><td style="font-family:monospace">{{vin}}</td>
    <td>{{lienholder}}</td><td>{{permitted_use}}</td><td>{{mileage_limit_annual}}</td>
  </tr>
  {{/each}}
  </tbody>
</table>

<h2>3. Lease Term</h2>
<p>The lease term shall commence on <strong>{{terms.start_date}}</strong> and shall expire on <strong>{{terms.end_date}}</strong>, a period of approximately <strong>{{terms.term_months}} months</strong> (the "<strong>Term</strong>"), unless sooner terminated pursuant to the terms hereof.</p>

<h2>4. Rent and Payment</h2>
<p><strong>4.1 Monthly Rent.</strong> Lessee shall pay Lessor a monthly lease payment of <strong>{{terms.monthly_lease_amount_display}}</strong> per vehicle per month (the "<strong>Monthly Rent</strong>"), due on the <strong>{{terms.payment_due_day}}th</strong> day of each calendar month during the Term.</p>
<p><strong>4.2 Late Fee.</strong> If any Monthly Rent payment is not received within <strong>{{terms.late_fee_grace_days}}</strong> calendar days of the due date, a late fee of <strong>{{terms.late_fee_display}}</strong> per vehicle per month shall be assessed and payable immediately.</p>
<p><strong>4.3 Security Deposit.</strong> Upon execution of this Agreement, Lessee shall deposit with Lessor the sum of <strong>{{terms.security_deposit_display}}</strong> as a security deposit (the "<strong>Security Deposit</strong>"). The Security Deposit shall be held by Lessor as security for the faithful performance by Lessee of all terms hereof and shall be returned to Lessee, without interest, within thirty (30) days after the expiration or termination of this Agreement, less any amounts owed to Lessor.</p>

<h2>5. Escrow</h2>
<p>Lessee shall deposit <strong>{{terms.escrow_display}}</strong> per month per vehicle into an escrow account maintained by <strong>{{terms.escrow_agent_name}}</strong> (the "<strong>Escrow</strong>"), to be applied toward maintenance reserves or returned to Lessee upon satisfactory completion of the Term. Escrow funds shall not be deemed rent and shall not be commingled with Lessor's operating accounts.</p>

<h2>6. Insurance and Maintenance</h2>
<p><strong>6.1 Insurance.</strong> Lessee shall, at its sole cost and expense, maintain in force throughout the Term: (a) commercial automobile liability insurance with combined single limits of not less than $1,000,000 per occurrence; (b) physical damage coverage (comprehensive and collision) on each vehicle in an amount not less than the actual cash value; and (c) such other insurance as required by applicable federal or state law. Lessee shall name Lessor as an additional insured and loss payee on all such policies and shall provide Lessor with certificates of insurance prior to taking possession of the Equipment.</p>
<p><strong>6.2 Maintenance.</strong> Lessee shall maintain each vehicle in good working order, repair, and condition, in compliance with all applicable federal, state, and local laws, regulations, and FMCSA requirements, at Lessee's sole expense. Lessee shall not make any material modifications to the Equipment without Lessor's prior written consent. At the expiration or termination of the Term, Lessee shall return each vehicle to Lessor in the same condition as received, ordinary wear and tear excepted.</p>
<p><strong>6.3 Permits and Compliance.</strong> Lessee shall obtain and maintain all operating authorities, permits, licenses, and registrations required for the lawful operation of the Equipment, including but not limited to USDOT authority, UCR, IRP, and IFTA, at Lessee's sole expense.</p>

<h2>7. Use of Equipment</h2>
<p>Lessee shall use the Equipment solely for lawful commercial transportation purposes within the continental United States. Lessee shall not sublease or permit any third party to operate the Equipment without Lessor's prior written consent. Lessee shall comply with all applicable laws, regulations, and carrier operating rules in the operation of the Equipment.</p>

<h2>8. Default and Remedies</h2>
<p><strong>8.1 Events of Default.</strong> Each of the following shall constitute an Event of Default: (a) failure to pay any Monthly Rent or other sum due hereunder within five (5) days after written notice from Lessor; (b) breach of any non-monetary obligation that remains uncured for ten (10) days after written notice; (c) insolvency, bankruptcy, or assignment for the benefit of creditors by Lessee; (d) abandonment of any vehicle; or (e) loss, suspension, or revocation of any operating authority required for lawful use of the Equipment.</p>
<p><strong>8.2 Remedies.</strong> Upon the occurrence of an Event of Default, Lessor may, at its election and without further notice: (a) terminate this Agreement; (b) repossess any or all vehicles; (c) pursue any and all remedies available at law or in equity, including recovery of all past-due rent, reasonable attorneys' fees, and costs of repossession.</p>

<h2>9. Return of Equipment</h2>
<p>Upon expiration or termination of this Agreement, Lessee shall return each vehicle to Lessor at the location designated by Lessor in writing no less than five (5) business days prior to the return date. Vehicles shall be returned clean, with current registration, and with all keys, documentation, and accessories originally delivered. Lessee shall be responsible for all costs of transport to the return location.</p>

<h2>10. Title and Ownership</h2>
<p>Title to the Equipment shall remain at all times with Lessor (or its lienholder, as applicable). This Agreement shall not be construed as a sale or option to purchase the Equipment. Lessee shall have no right, title, or interest in the Equipment except as a lessee herein. Lessee shall not create, incur, assume, or permit to exist any lien, charge, security interest, or encumbrance on the Equipment.</p>

<h2>11. No Purchase Option</h2>
<p>This is a pure operating lease. Lessee shall have no option to purchase any vehicle covered by this Agreement unless a separate written agreement signed by both parties expressly grants such option.</p>

<h2>12. Indemnification</h2>
<p>Lessee shall indemnify, defend, and hold harmless Lessor and its officers, directors, employees, and agents from and against any and all claims, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or resulting from: (a) Lessee's operation, use, or possession of the Equipment; (b) any breach of this Agreement by Lessee; or (c) any negligence or willful misconduct of Lessee or its drivers.</p>

<h2>13. Governing Law; Dispute Resolution</h2>
<p>This Agreement shall be governed by and construed in accordance with the laws of the State of <strong>{{terms.governing_law}}</strong>, without regard to its conflict-of-law provisions. Any dispute arising out of or relating to this Agreement shall be resolved exclusively in the state or federal courts located in <strong>{{terms.venue_county}} County, {{terms.governing_law}}</strong>, and the parties hereby irrevocably consent to personal jurisdiction and venue therein.</p>

<h2>14. Entire Agreement; Amendments</h2>
<p>This Agreement, together with any exhibits attached hereto, constitutes the entire agreement of the parties with respect to the subject matter hereof and supersedes all prior and contemporaneous negotiations, representations, warranties, and agreements. No amendment or modification of this Agreement shall be valid unless made in writing and signed by both parties.</p>

<h2>15. Notices</h2>
<p>All notices required or permitted under this Agreement shall be in writing and delivered by certified mail, overnight courier, or email with confirmed receipt to the addresses set forth in Section 1 above, or such other address as a party may designate in writing.</p>

<hr style="margin:32px 0 20px"/>

<div class="sig-block">
  <div style="flex:1">
    <p><strong>LESSOR:</strong> {{lessor.legal_name}}</p>
    <div class="sig-line">Signature</div>
    <div class="sig-line">{{lessor.contact_name}}, {{lessor.contact_title}}</div>
    <div class="sig-line">Date</div>
  </div>
  <div style="flex:1">
    <p><strong>LESSEE:</strong> {{lessee.legal_name}} {{lessee.entity_type}}</p>
    <div class="sig-line">Signature</div>
    <div class="sig-line">{{lessee.signer_name}}, {{lessee.signer_title}}</div>
    <div class="sig-line">Date</div>
  </div>
</div>

</body>
</html>`;

// Spanish print design: same stylesheet, same fifteen clauses, same {{tokens}} (the data binds identically). A
// draft for the owner's / counsel's review (attorney-review flow), like the English text — not legal advice.
const STYLESHEET = TRUCK_LEASE_CONTENT_HTML_EN.match(/<style[\s\S]*?<\/style>/)?.[0] ?? "";

export const TRUCK_LEASE_CONTENT_HTML_ES = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
${STYLESHEET}
</head>
<body>
<h1>Contrato de Arrendamiento de Camión Comercial</h1>
<p class="center" style="font-size:9.5pt;color:#555">Referencia No. {{terms.reference_no}} &nbsp;|&nbsp; Fecha de Firma: {{terms.execution_date}}</p>

<h2>1. Partes</h2>
<table class="parties"><tr>
  <td><strong>ARRENDADOR:</strong><br/>{{lessor.legal_name}}<br/>{{lessor.address}}<br/>{{lessor.city_state_zip}}<br/>Atención: {{lessor.contact_name}}, {{lessor.contact_title}}</td>
  <td><strong>ARRENDATARIO:</strong><br/>{{lessee.legal_name}} {{lessee.entity_type}}<br/>{{lessee.address}}<br/>{{lessee.city_state_zip}}<br/>Atención: {{lessee.signer_name}}, {{lessee.signer_title}}</td>
</tr></table>

<h2>2. Vehículos Arrendados</h2>
<p>El Arrendador otorga en arrendamiento al Arrendatario, y el Arrendatario toma en arrendamiento del Arrendador, los vehículos automotores comerciales que se identifican a continuación (en conjunto, el "<strong>Equipo</strong>"):</p>
<table class="vehicles">
  <thead><tr><th>#</th><th>Unidad</th><th>Año</th><th>Marca / Modelo</th><th>VIN</th><th>Acreedor Prendario</th><th>Uso Permitido</th><th>Límite Anual de Millas</th></tr></thead>
  <tbody>
  {{#each vehicles}}
  <tr>
    <td>{{sort_order}}</td><td>{{unit_number}}</td><td>{{year}}</td>
    <td>{{make}} {{model}}</td><td style="font-family:monospace">{{vin}}</td>
    <td>{{lienholder}}</td><td>{{permitted_use}}</td><td>{{mileage_limit_annual}}</td>
  </tr>
  {{/each}}
  </tbody>
</table>

<h2>3. Plazo del Arrendamiento</h2>
<p>El plazo del arrendamiento iniciará el <strong>{{terms.start_date}}</strong> y vencerá el <strong>{{terms.end_date}}</strong>, un periodo de aproximadamente <strong>{{terms.term_months}} meses</strong> (el "<strong>Plazo</strong>"), salvo que se dé por terminado anticipadamente conforme a lo aquí dispuesto.</p>

<h2>4. Renta y Pago</h2>
<p><strong>4.1 Renta Mensual.</strong> El Arrendatario pagará al Arrendador una renta de <strong>{{terms.monthly_lease_amount_display}}</strong> por vehículo por mes (la "<strong>Renta Mensual</strong>"), pagadera el día <strong>{{terms.payment_due_day}}</strong> de cada mes calendario durante el Plazo.</p>
<p><strong>4.2 Cargo por Mora.</strong> Si algún pago de Renta Mensual no se recibe dentro de los <strong>{{terms.late_fee_grace_days}}</strong> días naturales siguientes a su vencimiento, se causará un cargo por mora de <strong>{{terms.late_fee_display}}</strong> por vehículo por mes, exigible de inmediato.</p>
<p><strong>4.3 Depósito en Garantía.</strong> A la firma de este Contrato, el Arrendatario entregará al Arrendador la cantidad de <strong>{{terms.security_deposit_display}}</strong> como depósito en garantía (el "<strong>Depósito en Garantía</strong>"). El Arrendador conservará el Depósito en Garantía como garantía del fiel cumplimiento de todas las obligaciones del Arrendatario y lo devolverá al Arrendatario, sin intereses, dentro de los treinta (30) días siguientes al vencimiento o terminación de este Contrato, menos cualquier cantidad adeudada al Arrendador.</p>

<h2>5. Escrow</h2>
<p>El Arrendatario depositará <strong>{{terms.escrow_display}}</strong> por mes por vehículo en una cuenta de escrow administrada por <strong>{{terms.escrow_agent_name}}</strong> (el "<strong>Escrow</strong>"), que se aplicará a reservas de mantenimiento o se devolverá al Arrendatario al concluir satisfactoriamente el Plazo. Los fondos del Escrow no se considerarán renta y no se mezclarán con las cuentas operativas del Arrendador.</p>

<h2>6. Seguros y Mantenimiento</h2>
<p><strong>6.1 Seguros.</strong> El Arrendatario mantendrá vigentes durante todo el Plazo, por su exclusiva cuenta y cargo: (a) seguro de responsabilidad civil vehicular comercial con límite único combinado no menor a $1,000,000 por evento; (b) cobertura de daños materiales (amplia y colisión) para cada vehículo por un monto no menor a su valor real en efectivo; y (c) cualquier otro seguro que exija la legislación federal o estatal aplicable. El Arrendatario designará al Arrendador como asegurado adicional y beneficiario de pérdidas en todas dichas pólizas y le entregará los certificados de seguro antes de tomar posesión del Equipo.</p>
<p><strong>6.2 Mantenimiento.</strong> El Arrendatario mantendrá cada vehículo en buen estado de funcionamiento, reparación y conservación, en cumplimiento de todas las leyes, reglamentos y requisitos federales, estatales y locales aplicables, incluidos los de la FMCSA, por su exclusiva cuenta. El Arrendatario no realizará modificaciones sustanciales al Equipo sin el consentimiento previo y por escrito del Arrendador. Al vencimiento o terminación del Plazo, el Arrendatario devolverá cada vehículo al Arrendador en las mismas condiciones en que lo recibió, salvo el desgaste normal por el uso.</p>
<p><strong>6.3 Permisos y Cumplimiento.</strong> El Arrendatario obtendrá y mantendrá todas las autoridades de operación, permisos, licencias y registros necesarios para la operación lícita del Equipo, incluidos, entre otros, la autoridad USDOT, UCR, IRP e IFTA, por su exclusiva cuenta.</p>

<h2>7. Uso del Equipo</h2>
<p>El Arrendatario usará el Equipo exclusivamente para fines lícitos de transporte comercial dentro de los Estados Unidos continentales. El Arrendatario no subarrendará el Equipo ni permitirá que un tercero lo opere sin el consentimiento previo y por escrito del Arrendador. El Arrendatario cumplirá con todas las leyes, reglamentos y normas de operación de transportistas aplicables a la operación del Equipo.</p>

<h2>8. Incumplimiento y Recursos</h2>
<p><strong>8.1 Causas de Incumplimiento.</strong> Constituirá una Causa de Incumplimiento cualquiera de las siguientes: (a) la falta de pago de cualquier Renta Mensual u otra cantidad adeudada conforme a este Contrato dentro de los cinco (5) días siguientes a la notificación por escrito del Arrendador; (b) el incumplimiento de cualquier obligación no monetaria que no se subsane dentro de los diez (10) días siguientes a la notificación por escrito; (c) la insolvencia, quiebra o cesión general en beneficio de acreedores del Arrendatario; (d) el abandono de cualquier vehículo; o (e) la pérdida, suspensión o revocación de cualquier autoridad de operación necesaria para el uso lícito del Equipo.</p>
<p><strong>8.2 Recursos.</strong> Al ocurrir una Causa de Incumplimiento, el Arrendador podrá, a su elección y sin necesidad de aviso adicional: (a) dar por terminado este Contrato; (b) recuperar la posesión de cualquiera o todos los vehículos; (c) ejercer todos los recursos disponibles conforme a derecho o equidad, incluida la recuperación de toda la renta vencida, honorarios razonables de abogados y los costos de recuperación.</p>

<h2>9. Devolución del Equipo</h2>
<p>Al vencimiento o terminación de este Contrato, el Arrendatario devolverá cada vehículo al Arrendador en el lugar que éste designe por escrito con al menos cinco (5) días hábiles de anticipación a la fecha de devolución. Los vehículos se devolverán limpios, con registro vigente y con todas las llaves, documentos y accesorios entregados originalmente. El Arrendatario cubrirá todos los costos de traslado al lugar de devolución.</p>

<h2>10. Titularidad y Propiedad</h2>
<p>La titularidad del Equipo permanecerá en todo momento en el Arrendador (o en su acreedor prendario, según corresponda). Este Contrato no se interpretará como una compraventa ni como una opción de compra del Equipo. El Arrendatario no tendrá derecho, título ni interés alguno sobre el Equipo salvo como arrendatario conforme a este Contrato. El Arrendatario no constituirá, contraerá, asumirá ni permitirá que exista gravamen, cargo, garantía real o afectación alguna sobre el Equipo.</p>

<h2>11. Sin Opción de Compra</h2>
<p>Este es un arrendamiento puro (operativo). El Arrendatario no tendrá opción de compra sobre ningún vehículo amparado por este Contrato, salvo que un contrato escrito por separado, firmado por ambas partes, otorgue expresamente dicha opción.</p>

<h2>12. Indemnización</h2>
<p>El Arrendatario indemnizará, defenderá y sacará en paz y a salvo al Arrendador y a sus funcionarios, consejeros, empleados y agentes de y contra toda reclamación, daño, pérdida, costo y gasto (incluidos honorarios razonables de abogados) que surja de o resulte de: (a) la operación, uso o posesión del Equipo por el Arrendatario; (b) cualquier incumplimiento de este Contrato por el Arrendatario; o (c) cualquier negligencia o conducta dolosa del Arrendatario o de sus operadores.</p>

<h2>13. Ley Aplicable; Solución de Controversias</h2>
<p>Este Contrato se regirá e interpretará conforme a las leyes del Estado de <strong>{{terms.governing_law}}</strong>, sin consideración a sus normas de conflicto de leyes. Toda controversia que surja de o se relacione con este Contrato se resolverá exclusivamente ante los tribunales estatales o federales ubicados en el Condado de <strong>{{terms.venue_county}}, {{terms.governing_law}}</strong>, y las partes se someten irrevocablemente a su jurisdicción y competencia.</p>

<h2>14. Acuerdo Total; Modificaciones</h2>
<p>Este Contrato, junto con sus anexos, constituye el acuerdo total de las partes respecto de su objeto y sustituye todas las negociaciones, declaraciones, garantías y acuerdos previos y contemporáneos. Ninguna modificación a este Contrato será válida salvo que conste por escrito y esté firmada por ambas partes.</p>

<h2>15. Notificaciones</h2>
<p>Todas las notificaciones requeridas o permitidas conforme a este Contrato se harán por escrito y se entregarán por correo certificado, mensajería al día siguiente o correo electrónico con acuse de recibo, en los domicilios señalados en la Sección 1, o en cualquier otro domicilio que una parte designe por escrito.</p>

<hr style="margin:32px 0 20px"/>

<div class="sig-block">
  <div style="flex:1">
    <p><strong>ARRENDADOR:</strong> {{lessor.legal_name}}</p>
    <div class="sig-line">Firma</div>
    <div class="sig-line">{{lessor.contact_name}}, {{lessor.contact_title}}</div>
    <div class="sig-line">Fecha</div>
  </div>
  <div style="flex:1">
    <p><strong>ARRENDATARIO:</strong> {{lessee.legal_name}} {{lessee.entity_type}}</p>
    <div class="sig-line">Firma</div>
    <div class="sig-line">{{lessee.signer_name}}, {{lessee.signer_title}}</div>
    <div class="sig-line">Fecha</div>
  </div>
</div>

</body>
</html>`;
