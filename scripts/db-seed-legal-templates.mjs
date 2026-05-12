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
const texasTemplatesPath = path.resolve("docs/specs/templates/TEXAS_CONTRACT_TEMPLATES_FOR_ATTORNEY_REVIEW.md");

const NON_NDA_TEMPLATE_SPECS = [
  {
    sectionNumber: 1,
    template_code: "driver_ica",
    category: "driver",
    requires_witness: true,
    fallback_en: "INDEPENDENT CONTRACTOR AGREEMENT",
    fallback_es: "ACUERDO DE CONTRATISTA INDEPENDIENTE",
  },
  {
    sectionNumber: 2,
    template_code: "driver_deduction_auth",
    category: "driver",
    requires_witness: true,
    fallback_en: "DRIVER PAYROLL DEDUCTION AUTHORIZATION",
    fallback_es: "AUTORIZACION DE DEDUCCIONES DE PAGO PARA CONDUCTOR",
  },
  {
    sectionNumber: 3,
    template_code: "driver_drug_alcohol_consent",
    category: "driver",
    requires_witness: false,
    fallback_en: "DOT DRUG & ALCOHOL TESTING CONSENT AND NOTIFICATION",
    fallback_es: "CONSENTIMIENTO Y NOTIFICACION DE PRUEBAS DE DROGAS Y ALCOHOL DEL DOT",
  },
  {
    sectionNumber: 4,
    template_code: "driver_equipment_use",
    category: "driver",
    requires_witness: false,
    fallback_en: "COMPANY EQUIPMENT USE AND DAMAGE LIABILITY AGREEMENT",
    fallback_es: "ACUERDO DE USO Y RESPONSABILIDAD POR DANOS A EQUIPO DE LA COMPANIA",
  },
  {
    sectionNumber: 5,
    template_code: "employee_noncompete",
    category: "employment",
    requires_witness: false,
    fallback_en: "NON-COMPETE AND NON-SOLICITATION AGREEMENT",
    fallback_es: "PACTO DE NO COMPETENCIA Y NO CAPTACION",
  },
  {
    sectionNumber: 9,
    template_code: "employee_handbook_ack",
    category: "employment",
    requires_witness: false,
    fallback_en: "EMPLOYEE HANDBOOK ACKNOWLEDGMENT",
    fallback_es: "RECONOCIMIENTO DEL MANUAL DEL EMPLEADO",
  },
  {
    sectionNumber: 7,
    template_code: "customer_master_broker_carrier",
    category: "customer",
    requires_witness: false,
    fallback_en: "MASTER BROKER-CARRIER TRANSPORTATION AGREEMENT",
    fallback_es: "ACUERDO MAESTRO DE TRANSPORTE ENTRE INTERMEDIARIO Y TRANSPORTISTA",
  },
  {
    sectionNumber: 8,
    template_code: "customer_mutual_nda",
    category: "customer",
    requires_witness: true,
    fallback_en: "MUTUAL NDA (CUSTOMER/BROKER)",
    fallback_es: "ACUERDO MUTUO DE CONFIDENCIALIDAD",
  },
  {
    sectionNumber: 10,
    template_code: "policy_drug_free_workplace",
    category: "policy",
    requires_witness: false,
    fallback_en: "DOT SAFETY COMPLIANCE ACKNOWLEDGMENT",
    fallback_es: "RECONOCIMIENTO DE CUMPLIMIENTO DE SEGURIDAD DEL DOT",
  },
];

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

function normalizeVariableName(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function inferVariableType(name) {
  if (/_date$|^date_|_date_|_at$|^signed_date$/.test(name)) return "date";
  if (/(_amount$|_rate$|_limit$|_days$|_months$|_threshold$|_pct$|_percent$)/.test(name)) return "number";
  return "text";
}

function extractVariablesFromSection(markdownSection) {
  const variables = new Set();
  const regex = /\[VARIABLE:\s*([a-zA-Z0-9_]+)\]/g;
  let match = regex.exec(markdownSection);
  while (match) {
    const name = normalizeVariableName(match[1]);
    if (name) variables.add(name);
    match = regex.exec(markdownSection);
  }
  return Array.from(variables);
}

function replaceVariableMarkers(markdownSection) {
  return markdownSection.replace(/\[VARIABLE:\s*([a-zA-Z0-9_]+)\]/g, (_whole, rawName) => {
    const name = normalizeVariableName(rawName);
    return `{{${name}}}`;
  });
}

function inlineMarkdownToHtml(text) {
  let out = text;
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return out;
}

function markdownSectionToHtml(markdownSection) {
  const lines = markdownSection.split(/\r?\n/);
  const html = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeLists();
      continue;
    }
    if (line === "---") {
      closeLists();
      html.push("<hr />");
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdownToHtml(heading[2])}</h${level}>`);
      continue;
    }

    const olMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      if (inUl) {
        html.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        html.push("<ol>");
        inOl = true;
      }
      html.push(`<li>${inlineMarkdownToHtml(olMatch[2])}</li>`);
      continue;
    }

    const ulMatch = line.match(/^-\s+(.*)$/);
    if (ulMatch) {
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${inlineMarkdownToHtml(ulMatch[1])}</li>`);
      continue;
    }

    closeLists();
    html.push(`<p>${inlineMarkdownToHtml(line)}</p>`);
  }

  closeLists();
  return html.join("\n");
}

function buildVariableSchemaFromVariables(variables) {
  const fields = {};
  for (const variableName of variables) {
    fields[variableName] = {
      type: inferVariableType(variableName),
      required: true,
    };
  }
  return { fields };
}

function extractSection(markdown, sectionNumber) {
  const startRegex = new RegExp(`^##\\s+${sectionNumber}\\.\\s+`, "m");
  const startMatch = startRegex.exec(markdown);
  if (!startMatch) return null;
  const startIdx = startMatch.index;

  const remaining = markdown.slice(startIdx + 1);
  const endRegex = /^##\s+\d+\.\s+/m;
  const endMatch = endRegex.exec(remaining);
  const endIdx = endMatch ? startIdx + 1 + endMatch.index : markdown.length;
  return markdown.slice(startIdx, endIdx).trim();
}

function extractDisplayTitles(sectionMarkdown, fallbackEn, fallbackEs) {
  const enMatch = sectionMarkdown.match(/\*\*EN\*\*:\s*(.+)/i);
  const esMatch = sectionMarkdown.match(/\*\*ES\*\*:\s*(.+)/i);
  return {
    display_name_en: (enMatch?.[1] ?? fallbackEn).trim(),
    display_name_es: (esMatch?.[1] ?? fallbackEs).trim(),
  };
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

function buildTemplatesFromTexasMarkdown(markdown) {
  const templates = [];
  for (const spec of NON_NDA_TEMPLATE_SPECS) {
    const section = extractSection(markdown, spec.sectionNumber);
    if (!section) {
      throw new Error(`Missing section ${spec.sectionNumber} for template ${spec.template_code}`);
    }

    const replaced = replaceVariableMarkers(section);
    const variables = extractVariablesFromSection(section);
    const titles = extractDisplayTitles(section, spec.fallback_en, spec.fallback_es);
    const contentHtml = markdownSectionToHtml(replaced);
    const variableSchema = buildVariableSchemaFromVariables(variables);

    templates.push({
      template_code: spec.template_code,
      display_name_en: titles.display_name_en,
      display_name_es: titles.display_name_es,
      category: spec.category,
      content_html_en: contentHtml,
      content_html_es: "<!-- Spanish legal translation pending certified attorney review -->",
      variable_schema: variableSchema,
      requires_witness: spec.requires_witness,
    });
  }
  return templates;
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
    if (!fs.existsSync(texasTemplatesPath)) {
      throw new Error(`Missing templates markdown source: ${texasTemplatesPath}`);
    }
    const texasMarkdown = fs.readFileSync(texasTemplatesPath, "utf8");
    const nonNdaTemplates = buildTemplatesFromTexasMarkdown(texasMarkdown);

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
      ...nonNdaTemplates,
    ];

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
