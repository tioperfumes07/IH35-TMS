import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL;
if (!connectionString) {
  console.error("FAIL: Missing DATABASE_URL or DATABASE_DIRECT_URL");
  process.exit(1);
}

const ndaDocxPath = path.resolve("docs/specs/templates/IH35_Employee_NDA.docx");
const texasTemplatesPath = path.resolve("docs/specs/TEXAS_CONTRACT_TEMPLATES_FOR_ATTORNEY_REVIEW.md");

const ndaVariableSchema = {
  fields: {
    effective_date: { type: "date", required: true },
    employee_full_legal_name: { type: "text", required: true },
    employee_address: { type: "text", required: true },
    company_signer_name: { type: "text", required: true },
    company_signer_title: { type: "text", required: true },
    company_signed_date: { type: "date", required: true },
    employee_signed_date: { type: "date", required: true },
    company_phone: { type: "text", required: true },
  },
};

const placeholderVariableSchema = {
  fields: {
    signer_full_name: { type: "text", required: true },
    effective_date: { type: "date", required: true },
  },
};

function fallbackNdaHtml() {
  return `
<h1>IH35 Employee Non-Disclosure and Restricted Activity Agreement</h1>
<p><strong>Effective date:</strong> {{effective_date}}</p>
<p>This agreement is entered into between TRK, TRANSP, USMCA and {{employee_full_legal_name}} residing at {{employee_address}}.</p>
<h2>Federal and Texas legal framework</h2>
<p>This agreement includes DTSA whistleblower notice, protected activity carve-outs (EEOC/NLRB/OSHA/FMCSA), and Texas Business & Commerce Code compliance including Section 15.51 blue-pencil and Texas Property Code Section 41.001 assignment carve-outs.</p>
<h2>Confidential information scope</h2>
<p>Confidential Information includes dispatch margin data, customer rate matrices, lane strategy, load planning instructions, maintenance cost controls, safety incident trends, bank and factoring workflows, settlement logic, and proprietary operating data across TRK, TRANSP, and USMCA.</p>
<h2>Restricted activity</h2>
<p>Employee agrees to a 12-month customer and employee non-solicitation restriction subject to enforceability under Texas law and court modification if required.</p>
<h2>Bilingual clause and controlling language</h2>
<p>Any courtesy Spanish translation is for readability only. English version controls for interpretation and enforcement.</p>
<h2>Electronic signature</h2>
<p>Parties agree to electronic signatures and records under TUETA and the federal E-SIGN Act.</p>
<h2>Venue</h2>
<p>Venue and jurisdiction are agreed in Webb County, Laredo, Texas.</p>
<h2>Company signature</h2>
<p>Name: {{company_signer_name}}</p>
<p>Title: {{company_signer_title}}</p>
<p>Date: {{company_signed_date}}</p>
<p>Phone: {{company_phone}}</p>
<h2>Employee signature</h2>
<p>Name: {{employee_full_legal_name}}</p>
<p>Date: {{employee_signed_date}}</p>
`;
}

async function convertNdaDocxToHtml() {
  if (!fs.existsSync(ndaDocxPath)) {
    return {
      html: fallbackNdaHtml(),
      source: "fallback",
    };
  }

  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml({ path: ndaDocxPath });
  let html = result.value || "";
  if (!html.trim()) {
    html = fallbackNdaHtml();
  }

  // Ensure required variables are explicitly represented even if source formatting differs.
  if (!html.includes("{{effective_date}}")) html = `<p><strong>Effective date:</strong> {{effective_date}}</p>${html}`;
  if (!html.includes("{{employee_full_legal_name}}")) html += `<p>Employee: {{employee_full_legal_name}}</p>`;
  if (!html.includes("{{employee_address}}")) html += `<p>Employee address: {{employee_address}}</p>`;
  if (!html.includes("{{company_signer_name}}")) html += `<p>Company signer: {{company_signer_name}}</p>`;
  if (!html.includes("{{company_signer_title}}")) html += `<p>Company signer title: {{company_signer_title}}</p>`;
  if (!html.includes("{{company_signed_date}}")) html += `<p>Company signed date: {{company_signed_date}}</p>`;
  if (!html.includes("{{employee_signed_date}}")) html += `<p>Employee signed date: {{employee_signed_date}}</p>`;
  if (!html.includes("{{company_phone}}")) html = `<p>Company phone: {{company_phone}}</p>${html}`;

  return {
    html,
    source: "docx",
  };
}

function extractTemplateHeadingsFromMarkdown(markdown) {
  const headings = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^##\s+/.test(line))
    .map((line) => line.replace(/^##\s+/, "").trim())
    .filter(Boolean);
  return Array.from(new Set(headings));
}

function slugifyTemplateCode(input) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120);
}

function buildPlaceholderTemplatesFromSource() {
  if (fs.existsSync(texasTemplatesPath)) {
    const markdown = fs.readFileSync(texasTemplatesPath, "utf8");
    const headings = extractTemplateHeadingsFromMarkdown(markdown);
    const templates = [];
    for (const heading of headings) {
      const code = slugifyTemplateCode(heading);
      if (!code || code === "employee_nda") continue;
      templates.push({
        template_code: code,
        display_name_en: heading,
        display_name_es: `${heading} (ES placeholder)`,
      });
      if (templates.length >= 9) break;
    }
    return templates;
  }

  return [
    { template_code: "independent_contractor_agreement", display_name_en: "Independent Contractor Agreement", display_name_es: "Contrato de Contratista Independiente" },
    { template_code: "driver_deduction_authorization", display_name_en: "Driver Deduction Authorization", display_name_es: "Autorizacion de Deducciones del Conductor" },
    { template_code: "confidentiality_acknowledgment", display_name_en: "Confidentiality Acknowledgment", display_name_es: "Acuse de Confidencialidad" },
    { template_code: "arbitration_agreement", display_name_en: "Arbitration Agreement", display_name_es: "Convenio de Arbitraje" },
    { template_code: "employee_handbook_acknowledgment", display_name_en: "Employee Handbook Acknowledgment", display_name_es: "Acuse del Manual del Empleado" },
    { template_code: "equipment_use_agreement", display_name_en: "Equipment Use Agreement", display_name_es: "Convenio de Uso de Equipo" },
    { template_code: "safety_policy_acknowledgment", display_name_en: "Safety Policy Acknowledgment", display_name_es: "Acuse de Politicas de Seguridad" },
    { template_code: "drug_alcohol_consent", display_name_en: "Drug and Alcohol Consent", display_name_es: "Consentimiento de Drogas y Alcohol" },
    { template_code: "at_will_employment_acknowledgment", display_name_en: "At-Will Employment Acknowledgment", display_name_es: "Acuse de Empleo de Libre Terminacion" },
  ];
}

function buildPlaceholderHtml(title) {
  return `<h1>${title}</h1><p>Attorney placeholder draft for Phase 8A template library.</p><p>Signer: {{signer_full_name}}</p><p>Effective date: {{effective_date}}</p>`;
}

const client = new pg.Client({ connectionString });

async function run() {
  await client.connect();
  await client.query("BEGIN");
  try {
    const companiesRes = await client.query(
      `
        SELECT id
        FROM org.companies
        WHERE is_active = true
        ORDER BY created_at ASC
      `
    );
    const companyIds = companiesRes.rows.map((row) => row.id);
    if (companyIds.length === 0) {
      throw new Error("No active operating companies found for legal template seeding.");
    }

    const nda = await convertNdaDocxToHtml();
    const placeholders = buildPlaceholderTemplatesFromSource();
    const templates = [
      {
        template_code: "employee_nda",
        display_name_en: "Employee Non-Disclosure Agreement",
        display_name_es: "Acuerdo de Confidencialidad para Empleado",
        category: "employment",
        content_html_en: nda.html,
        content_html_es: "<!-- Spanish legal translation pending certified attorney/translator review. English controls per contract clause. -->",
        variable_schema: ndaVariableSchema,
        requires_witness: true,
      },
      ...placeholders.map((item) => ({
        template_code: item.template_code,
        display_name_en: item.display_name_en,
        display_name_es: item.display_name_es,
        category: "general",
        content_html_en: buildPlaceholderHtml(item.display_name_en),
        content_html_es: "<!-- Spanish legal translation pending certified attorney review -->",
        variable_schema: placeholderVariableSchema,
        requires_witness: item.template_code.includes("independent_contractor") || item.template_code.includes("deduction") || item.template_code.includes("nda"),
      })),
    ].slice(0, 10);

    let inserted = 0;
    for (const operatingCompanyId of companyIds) {
      for (const template of templates) {
        const res = await client.query(
          `
            INSERT INTO legal.contract_templates (
              operating_company_id,
              template_code,
              version,
              display_name_en,
              display_name_es,
              category,
              content_html_en,
              content_html_es,
              variable_schema,
              requires_witness,
              status
            ) VALUES (
              $1,$2,1,$3,$4,$5,$6,$7,$8::jsonb,$9,'draft'
            )
            ON CONFLICT (operating_company_id, template_code, version) DO NOTHING
          `,
          [
            operatingCompanyId,
            template.template_code,
            template.display_name_en,
            template.display_name_es,
            template.category,
            template.content_html_en,
            template.content_html_es,
            JSON.stringify(template.variable_schema),
            template.requires_witness,
          ]
        );
        inserted += res.rowCount ?? 0;
      }
    }

    await client.query("COMMIT");
    console.log(`seed: legal templates inserted=${inserted}`);
    console.log(`seed: nda_source=${nda.source}`);
    console.log("PASS: db-seed-legal-templates");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(`FAIL: db-seed-legal-templates -> ${String(error.message || error)}`);
    process.exit(1);
  } finally {
    await client.end().catch(() => undefined);
  }
}

await run();
