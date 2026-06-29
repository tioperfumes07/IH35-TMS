// One-time generator (dev tool — not run in CI). Converts the verbatim legal .txt
// (from the IH35-TMS-LEGAL-TEMPLATES zip, exported via textutil to scratchpad) into
// apps/backend/src/legal/templates/legal-template-library.generated.ts.
//
// The generated .ts is the committed artifact; this script just produces it so the
// legal bodies are VERBATIM from the source docx (no paraphrase risk). Re-run after
// editing a source doc:  node scripts/legal/generate-template-library.mjs
//
// Fill-form variables (variable_schema.fields) are inserted at anchor phrases; all
// remaining "____" runs (signatures, notary, exhibit schedules) become ruled fill
// lines for print/e-sign. English controls; Spanish body is the pending-translation
// placeholder per docs/specs/LEGAL-FINANCE-OWNERSHIP-AND-FLIP-READINESS.md.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..", "..");
const SRC_DIR =
  process.env.LEGAL_DOCX_TXT_DIR ||
  "/private/tmp/claude-501/-Users-jorgemunoz-IH35-TMS-clean/c9631963-a5cd-4123-9c45-a2466ad8193d/scratchpad/legal-docx";
const OUT = join(REPO, "apps/backend/src/legal/templates/legal-template-library.generated.ts");

const ES_PLACEHOLDER_NOTE =
  "<!-- Spanish legal translation pending certified attorney/translator review. English controls per contract clause. -->";

const DRAFT_BANNER =
  '<div class="draft-banner">DRAFT — for attorney review (Carl Barto). Not legal advice. Confirm all blanks and the employing entity before execution.</div>';

const STYLE = `<style>
  body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.55;color:#111;margin:0;padding:0}
  h1{font-size:14pt;text-align:center;text-transform:uppercase;letter-spacing:.06em;margin:0 0 2px}
  .subtitle{text-align:center;font-size:10pt;color:#555;margin:0 0 2px}
  h2{font-size:11pt;text-transform:uppercase;letter-spacing:.04em;margin:16px 0 6px;border-bottom:1px solid #999;padding-bottom:2px}
  p{margin:6px 0}
  .draft-banner{border:1px solid #b91c1c;color:#b91c1c;background:#fef2f2;font-size:9pt;font-weight:bold;text-align:center;padding:5px 8px;margin:0 0 12px;text-transform:uppercase;letter-spacing:.03em}
  .fill{display:inline-block;min-width:140px;border-bottom:1px solid #333;line-height:1.1}
  .sig-block{margin-top:14px}
  table.schedule{width:100%;border-collapse:collapse;font-size:9.5pt;margin:8px 0}
  table.schedule th{background:#f0f0f0;padding:4px 6px;text-align:left;border:1px solid #ccc}
  table.schedule td{padding:4px 6px;border:1px solid #ccc}
</style>`;

function esc(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// A line is a section heading if it is a numbered clause, an ARTICLE, an EXHIBIT,
// or a short all-caps label.
function isHeading(line) {
  const t = line.trim();
  if (!t) return false;
  if (/^\d+\.\s+\S/.test(t)) return true;
  if (/^ARTICLE\s+[IVXLC0-9]+\b/i.test(t)) return true;
  if (/^EXHIBIT\s+[A-Z]\b/i.test(t)) return true;
  if (/^(RECITALS|NOW, THEREFORE|NOTARY ACKNOWLEDGMENT|NOTARY ACKNOWLEDGMENTS|TRANSACTION SUMMARY|IN WITNESS WHEREOF|PROTECTED RIGHTS|SIGNATURES)\b/i.test(t)) return true;
  // all-caps short label (<= 6 words), letters only
  if (t.length <= 60 && t === t.toUpperCase() && /[A-Z]/.test(t) && t.split(/\s+/).length <= 7 && !/[_]/.test(t)) return true;
  return false;
}

// Convert remaining underscore runs to ruled fill lines.
function fillBlanks(s) {
  return s.replace(/_{2,}/g, '<span class="fill">&nbsp;</span>');
}

// Build the HTML body: apply anchor replacements on escaped text, then wrap lines.
function buildHtml(cfg) {
  const raw = readFileSync(join(SRC_DIR, cfg.src), "utf8").replace(/\r/g, "");
  // Drop the in-doc drafting notes to counsel (kept out of the executed instrument).
  let text = raw
    .split("\n")
    .filter((l) => !/^\[Drafting note to counsel:/.test(l.trim()))
    .join("\n");
  let body = esc(text);
  for (const [pattern, repl] of cfg.replacements || []) {
    body = body.replace(pattern, repl);
  }
  const lines = body.split("\n");
  const out = [];
  out.push(STYLE);
  out.push(DRAFT_BANNER);
  out.push(`<h1>${cfg.title}</h1>`);
  if (cfg.subtitle) out.push(`<p class="subtitle">${cfg.subtitle}</p>`);
  let titleConsumed = 0;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const t = line.trim();
    if (!t) continue;
    // skip the source's own title lines (we render our own <h1>/subtitle)
    if (titleConsumed < (cfg.skipLeadingLines || 0)) {
      titleConsumed++;
      continue;
    }
    const html = fillBlanks(line.trim());
    if (isHeading(t)) {
      out.push(`<h2>${html}</h2>`);
    } else {
      out.push(`<p>${html}</p>`);
    }
  }
  return out.join("\n");
}

// ---- Template configs (7) ---------------------------------------------------
const TEMPLATES = [
  {
    code: "lease_v1_carl_barto",
    version: 1,
    display_name_en: "Truck Lease-to-Own — V1 (Carl Barto)",
    display_name_es: "Arrendamiento con Opción a Compra de Camión — V1 (Carl Barto)",
    category: "lease",
    requires_witness: true,
    title: "Lease-to-Own Asset Acquisition Agreement With Option to Purchase",
    subtitle: "Version 1 — Carl Barto Original",
    src: "IH35_Lease_V1_Carl-Barto-Original.txt",
    skipLeadingLines: 3,
    fields: {
      effective_date: { type: "date", required: true, description: "Agreement effective date" },
      buyer_name: { type: "text", required: true, description: "Buyer legal name" },
      use_charge_percent: { type: "number", required: true, description: "Monthly use charge (% of loads invoiced)" },
      lease_term_months: { type: "number", required: true, description: "Lease term in months" },
    },
    replacements: [
      [/as of ________+, 2026/, "as of {{effective_date}}, 2026"],
      [/and ________+ (\(“Buyer”\))/, "and {{buyer_name}} $1"],
      [/equal to ______+ percent \(____+%\)/, "equal to {{use_charge_percent}} percent ({{use_charge_percent}}%)"],
      [/shall be ________+ months/, "shall be {{lease_term_months}} months"],
    ],
  },
  {
    code: "lease_v2_comprehensive",
    version: 1,
    display_name_en: "Truck Lease-to-Own — V2 (Comprehensive, Finance & Title)",
    display_name_es: "Arrendamiento con Opción a Compra de Camión — V2 (Integral, Financiamiento y Título)",
    category: "lease",
    requires_witness: true,
    title: "Lease-to-Own Commercial Motor Vehicle Finance and Title Transfer Agreement",
    subtitle: "Version 2 — Comprehensive (Option A FMV / Option B Payoff; UCC-1)",
    src: "IH35_Lease-to-Own_COMPREHENSIVE_v2_DRAFT.txt",
    skipLeadingLines: 0,
    fields: {
      effective_date: { type: "date", required: true, description: "Effective date" },
      operator_name: { type: "text", required: true, description: "Operator / Buyer / Lessee legal name" },
      title_recipient_name: { type: "text", required: false, description: "Title Recipient / Additional Obligor (if applicable)" },
      guarantor_name: { type: "text", required: false, description: "Guarantor(s) (if required)" },
    },
    replacements: [
      [/Effective Date: ________+, 2026/, "Effective Date: {{effective_date}}, 2026"],
      [/Operator \/ Buyer \/ Lessee: ________+/, "Operator / Buyer / Lessee: {{operator_name}}"],
      [/Title Recipient \/ Additional Obligor: ________+/, "Title Recipient / Additional Obligor: {{title_recipient_name}}"],
      [/Guarantor\(s\): ________+/, "Guarantor(s): {{guarantor_name}}"],
    ],
  },
  {
    code: "lease_v3_operating",
    version: 1,
    display_name_en: "Equipment Lease — V3 (Operating, No Purchase)",
    display_name_es: "Arrendamiento de Equipo — V3 (Operativo, Sin Compra)",
    category: "lease",
    requires_witness: true,
    title: "Commercial Equipment Lease Agreement",
    subtitle: "Version 3 — Operating, No Purchase (returns to Lessor)",
    src: "IH35_Lease_V3_Operating-No-Purchase.txt",
    skipLeadingLines: 0,
    fields: {
      effective_date: { type: "date", required: true, description: "Effective date" },
      lessee_name: { type: "text", required: true, description: "Lessee legal name" },
      commencement_date: { type: "date", required: true, description: "Commencement date" },
      term_months: { type: "number", required: true, description: "Term in months" },
      lessee_mc_number: { type: "text", required: true, description: "Lessee operating authority MC number" },
    },
    replacements: [
      [/made and entered into as of ________+, 2026/, "made and entered into as of {{effective_date}}, 2026"],
      [/company \(“Lessor”\), and ________+ \(“Lessee”\)/, "company (“Lessor”), and {{lessee_name}} (“Lessee”)"],
      [/shall begin on ________+, 2026 \(the “Commencement Date”\) and continue for ________+ months/, "shall begin on {{commencement_date}}, 2026 (the “Commencement Date”) and continue for {{term_months}} months"],
      [/\(MC No\. ________+\)/, "(MC No. {{lessee_mc_number}})"],
    ],
  },
  {
    code: "lease_v4_chatgpt",
    version: 1,
    display_name_en: "Truck Lease-to-Own — V4 (Payoff & Title Transfer)",
    display_name_es: "Arrendamiento con Opción a Compra de Camión — V4 (Liquidación y Transferencia de Título)",
    category: "lease",
    requires_witness: true,
    title: "Lease-to-Own Commercial Motor Vehicle Finance and Title Transfer Agreement",
    subtitle: "Version 4 — Payoff-based; individual title transfer on payoff",
    src: "IH35_Lease_V4_ChatGPT-Finance-Title-Transfer.txt",
    skipLeadingLines: 3,
    fields: {
      effective_date: { type: "date", required: true, description: "Effective date" },
      operator_name: { type: "text", required: true, description: "Operator legal name" },
      title_recipient_name: { type: "text", required: true, description: "Asset Holding Company / Title Recipient" },
    },
    replacements: [
      [/made and entered into as of ________+, 2026/, "made and entered into as of {{effective_date}}, 2026"],
      [/company \(“Seller”\); ________+ \(“Operator”\); and ________+ \(“Asset Holding Company” \/ “Title Recipient”\)/, "company (“Seller”); {{operator_name}} (“Operator”); and {{title_recipient_name}} (“Asset Holding Company” / “Title Recipient”)"],
    ],
  },
  {
    code: "nda_ebt_confidentiality",
    version: 1,
    display_name_en: "NDA — EBT Confidentiality (drivers / low-access)",
    display_name_es: "Acuerdo de Confidencialidad — EBT (conductores / acceso limitado)",
    category: "employment",
    requires_witness: false,
    title: "Employee Non-Disclosure Agreement",
    subtitle: "Confidentiality only — drivers / low-access roles",
    src: "IH35_NDA_Only_Confidentiality.txt",
    skipLeadingLines: 3,
    fields: {
      company_entity_suffix: { type: "text", required: true, description: "Employing IH 35 entity (e.g. Transport LLC)" },
      employee_name: { type: "text", required: true, description: "Employee legal name" },
    },
    replacements: [
      [/IH 35 ________+ \(“Company”\) and ________+ \(“Employee”\)/, "IH 35 {{company_entity_suffix}} (“Company”) and {{employee_name}} (“Employee”)"],
    ],
  },
  {
    code: "nda_chatgpt_full",
    version: 1,
    display_name_en: "NDA / Non-Solicit / Non-Compete — Full (ChatGPT)",
    display_name_es: "Confidencialidad / No-Solicitud / No-Competencia — Completo (ChatGPT)",
    category: "employment",
    requires_witness: false,
    title: "Confidentiality, Non-Solicitation and Non-Competition Agreement",
    subtitle: "Full layered version (office roles)",
    src: "IH35_NDA_ChatGPT_Version.txt",
    skipLeadingLines: 4,
    fields: {
      company_entity_suffix: { type: "text", required: true, description: "Employing IH 35 entity" },
      employee_name: { type: "text", required: true, description: "Worker legal name" },
      role_title: { type: "text", required: false, description: "Worker position / role" },
      effective_date: { type: "date", required: true, description: "Effective date" },
    },
    replacements: [
      [/IH 35 ________+ \(the “Company”\)/, "IH 35 {{company_entity_suffix}} (the “Company”)"],
      [/Worker\n____+/, "Worker\n{{employee_name}}"],
      [/Position \/ Role\n____+/, "Position / Role\n{{role_title}}"],
      [/Effective Date\n____________________, 20____/, "Effective Date\n{{effective_date}}"],
    ],
  },
  {
    code: "nda_polished_full",
    version: 1,
    display_name_en: "NDA / Non-Solicit / Non-Compete — Full (IH35 Polished)",
    display_name_es: "Confidencialidad / No-Solicitud / No-Competencia — Completo (IH35 Pulido)",
    category: "employment",
    requires_witness: false,
    title: "Confidentiality, Non-Solicitation and Non-Competition Agreement",
    subtitle: "IH35 polished, annotated full version (office roles)",
    src: "IH35_NDA_Full_NonCompete_Texas.txt",
    skipLeadingLines: 4,
    fields: {
      company_entity_suffix: { type: "text", required: true, description: "Employing IH 35 entity" },
      employee_name: { type: "text", required: true, description: "Worker legal name" },
      role_title: { type: "text", required: false, description: "Worker position / role" },
      effective_date: { type: "date", required: true, description: "Effective date" },
    },
    replacements: [
      [/IH 35 ________+ \(the “Company”\)/, "IH 35 {{company_entity_suffix}} (the “Company”)"],
      [/Worker\n____+/, "Worker\n{{employee_name}}"],
      [/Position \/ Role\n____+/, "Position / Role\n{{role_title}}"],
      [/Effective Date\n____________________, 20____/, "Effective Date\n{{effective_date}}"],
    ],
  },
];

const records = TEMPLATES.map((cfg) => {
  const html = buildHtml(cfg);
  return {
    template_code: cfg.code,
    version: cfg.version,
    display_name_en: cfg.display_name_en,
    display_name_es: cfg.display_name_es,
    category: cfg.category,
    requires_witness: cfg.requires_witness,
    variable_schema: { fields: cfg.fields },
    content_html_en: html,
    content_html_es: `${ES_PLACEHOLDER_NOTE}\n${html}`,
  };
});

const banner = `// AUTO-GENERATED by scripts/legal/generate-template-library.mjs — DO NOT EDIT BY HAND.
// Source: IH35-TMS-LEGAL-TEMPLATES (.docx, verbatim). English controls; ES is the
// certified-translation-pending placeholder. 7 templates, owner-activated pre-review
// (attorney_notes='Owner-activated; pending Carl Barto review'). See
// docs/specs/LEGAL-FINANCE-OWNERSHIP-AND-FLIP-READINESS.md.
/* eslint-disable */
`;

const tsBody = `${banner}
export type LegalLibraryTemplate = {
  template_code: string;
  version: number;
  display_name_en: string;
  display_name_es: string;
  category: string;
  requires_witness: boolean;
  variable_schema: { fields: Record<string, { type: "text" | "date" | "number" | "boolean"; required: boolean; description?: string }> };
  content_html_en: string;
  content_html_es: string;
};

export const LEGAL_TEMPLATE_LIBRARY: LegalLibraryTemplate[] = ${JSON.stringify(records, null, 2)};

export const LEGAL_TEMPLATE_LIBRARY_CODES = LEGAL_TEMPLATE_LIBRARY.map((t) => t.template_code);
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, tsBody, "utf8");
console.log(`Generated ${OUT}`);
console.log(`Templates: ${records.map((r) => `${r.template_code}(v${r.version})`).join(", ")}`);
for (const r of records) {
  const remaining = (r.content_html_en.match(/class="fill"/g) || []).length;
  const vars = (r.content_html_en.match(/\{\{/g) || []).length;
  console.log(`  ${r.template_code}: ${r.content_html_en.length}b html, ${vars} handlebars, ${remaining} ruled fill-lines`);
}
