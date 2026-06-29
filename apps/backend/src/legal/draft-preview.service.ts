// Legal draft preview — renders a WATERMARKED, NOT-FOR-EXECUTION HTML preview of a
// template with the creator's filled variables merged in. Preview/print only.
//
// HARD INVARIANT: this module performs ZERO writes — it NEVER inserts a
// legal.contract_instances row (or any row). A draft preview must not create an
// instance (enforced by scripts/verify-steps/*-verify-legal-draft-preview-no-instance.mjs).
// The executed instance is created only by createContractInstance via "+ Create & send".

import Handlebars from "handlebars";

type QueryableClient = {
  query: (query: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

function normalizeTemplateCode(code: string): string {
  return code.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

const DRAFT_WRAPPER = (inner: string, meta: { code: string; version: number; language: string }) => `<!DOCTYPE html>
<html lang="${meta.language === "es" ? "es" : "en"}">
<head>
<meta charset="utf-8"/>
<title>DRAFT preview — ${meta.code} v${meta.version}</title>
<style>
  @media print { .draft-toolbar { display:none } }
  body{margin:0;background:#525659}
  .page{max-width:8.5in;margin:18px auto;background:#fff;padding:0.75in;box-shadow:0 0 8px rgba(0,0,0,.4);position:relative;overflow:hidden}
  .watermark{position:fixed;top:42%;left:0;right:0;text-align:center;font:bold 64px Arial,sans-serif;color:rgba(220,38,38,.10);transform:rotate(-24deg);letter-spacing:.06em;pointer-events:none;z-index:9999;white-space:nowrap}
  .draft-toolbar{position:sticky;top:0;background:#1f2a44;color:#fff;font:12px Arial,sans-serif;padding:8px 14px;display:flex;justify-content:space-between;align-items:center;z-index:10000}
  .draft-toolbar button{background:#fff;color:#1f2a44;border:0;border-radius:4px;padding:5px 10px;font-weight:bold;cursor:pointer}
  .draft-pill{display:inline-block;border:1px solid #b91c1c;color:#b91c1c;background:#fef2f2;font:bold 10px Arial;padding:3px 8px;border-radius:3px;letter-spacing:.04em}
</style>
</head>
<body>
<div class="draft-toolbar">
  <span class="draft-pill">DRAFT — NOT FOR EXECUTION · ${meta.code} v${meta.version} · ${meta.language.toUpperCase()}</span>
  <button onclick="window.print()">Print / Save PDF</button>
</div>
<div class="watermark">DRAFT — NOT FOR EXECUTION</div>
<div class="page">
${inner}
</div>
</body>
</html>`;

export async function renderDraftContractHtml(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    template_id?: string | null;
    template_code?: string | null;
    language: "en" | "es" | "bilingual";
    filled_variables: Record<string, unknown>;
  }
) {
  const selectorById = args.template_id ? "AND t.id = $2" : "";
  const selectorByCode = !args.template_id && args.template_code ? "AND t.template_code = $2" : "";
  const selectorValue = args.template_id ?? normalizeTemplateCode(String(args.template_code ?? ""));

  const res = await client.query(
    `
      SELECT t.template_code, t.version, t.content_html_en, t.content_html_es
      FROM legal.contract_templates t
      WHERE t.operating_company_id = $1
        ${selectorById}
        ${selectorByCode}
        AND t.status = 'active'
      ORDER BY t.version DESC
      LIMIT 1
    `,
    [args.operatingCompanyId, selectorValue]
  );
  const template = res.rows[0] ?? null;
  if (!template) throw new Error("legal_active_template_required");

  // English controls; ES body is the pending-translation placeholder until certified.
  const bodyHtml =
    args.language === "es" ? String(template.content_html_es ?? template.content_html_en) : String(template.content_html_en);

  // noEscape: template bodies are trusted HTML authored from the source docx.
  const merged = Handlebars.compile(bodyHtml, { noEscape: true })(args.filled_variables ?? {});

  return {
    template_code: String(template.template_code),
    template_version: Number(template.version),
    html: DRAFT_WRAPPER(merged, {
      code: String(template.template_code),
      version: Number(template.version),
      language: args.language,
    }),
  };
}
