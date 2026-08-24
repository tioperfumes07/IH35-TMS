#!/usr/bin/env node
/**
 * DOCS-F-PREVIEW-CATEGORY-ALWAYS-UNCATEGORIZED — GET /api/v1/docs/:id (docs.routes.ts) is fetched
 * by getDocsFoundationDetail(), typed on the frontend as DocsFile (apiRequest<DocsFile>), and fed
 * straight into the shared PreviewModal component (apps/frontend/src/components/documents/
 * PreviewModal.tsx), which renders `file.category_label ?? "Uncategorized"`. The endpoint used to
 * alias the join as `fc.code AS type, fc.label AS type_label` (the list-row shape used by
 * DocsFoundationRow) instead of `category_code`/`category_label` (the field names the DocsFile
 * type and PreviewModal actually read, and the same names the sibling /api/v1/docs/files endpoint
 * in files.routes.ts already uses) — so file.category_label was always undefined at runtime and
 * every single document's Preview modal showed "Uncategorized" regardless of its real category.
 * Live-reproduced: uploaded a real test document with Category "Other" — the list row correctly
 * showed Type=Other, but its own Preview modal showed "Category: Uncategorized".
 *
 * Guard: /api/v1/docs/:id's category join must alias category_code / category_label, matching the
 * DocsFile contract PreviewModal depends on — not type / type_label (that shape belongs to the
 * list endpoint's DocsFoundationRow only).
 *
 * Usage:
 *   node scripts/verify-docs-preview-category-field-alias.mjs
 *   node scripts/verify-docs-preview-category-field-alias.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-docs-preview-category-field-alias";
const ROUTES = "apps/backend/src/docs/docs.routes.ts";

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Isolate the GET /api/v1/docs/:id handler body so this guard cannot be satisfied by the
 *  unrelated list endpoint (which legitimately keeps `fc.code AS type, fc.label AS type_label`). */
function extractDetailHandler(src) {
  const marker = `app.get("/api/v1/docs/:id"`;
  const start = src.indexOf(marker);
  if (start === -1) return null;
  return src.slice(start, start + 2000);
}

export function collectProblems(src) {
  const problems = [];
  const s = stripComments(src);
  const handler = extractDetailHandler(s);

  if (!handler) {
    problems.push(`${ROUTES}: GET /api/v1/docs/:id handler not found`);
    return problems;
  }
  if (/fc\.code AS type\b/.test(handler) || /fc\.label AS type_label\b/.test(handler)) {
    problems.push(
      `${ROUTES}: GET /api/v1/docs/:id must not alias the category join as type/type_label — the frontend types this response DocsFile and reads category_code/category_label; the list-row shape (type/type_label) belongs only to the separate list endpoint`,
    );
  }
  if (!/fc\.code AS category_code\b/.test(handler) || !/fc\.label AS category_label\b/.test(handler)) {
    problems.push(
      `${ROUTES}: GET /api/v1/docs/:id must alias the category join as fc.code AS category_code, fc.label AS category_label to match the DocsFile contract PreviewModal depends on`,
    );
  }
  return problems;
}

const good = `
  app.get("/api/v1/docs/:id", { config: {} }, async (req, reply) => {
    const res = await client.query(\`
      SELECT
        f.*,
        fc.code AS category_code,
        fc.label AS category_label
      FROM docs.files f
    \`);
  });
`;
const bad = `
  app.get("/api/v1/docs/:id", { config: {} }, async (req, reply) => {
    const res = await client.query(\`
      SELECT
        f.*,
        fc.code AS type,
        fc.label AS type_label
      FROM docs.files f
    \`);
  });
`;

if (process.argv.includes("--selftest")) {
  const passGood = collectProblems(good);
  if (passGood.length) {
    console.error(`${LABEL} --selftest FAIL: good fixture produced errors:`, passGood);
    process.exit(1);
  }
  const failBad = collectProblems(bad);
  if (failBad.length < 2) {
    console.error(`${LABEL} --selftest FAIL: bad fixture too weak:`, failBad);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, ROUTES), "utf8");
const problems = collectProblems(src);
if (problems.length) {
  console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — docs detail endpoint aliases category_code/category_label, matching the DocsFile/PreviewModal contract`);
process.exit(0);
