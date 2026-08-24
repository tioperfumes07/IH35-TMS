#!/usr/bin/env node
/**
 * DOCS-F-TYPE-FILTER-EXACT-MATCH-ONLY — GET /api/v1/docs's `type` query param used to be pushed
 * into ILIKE with no wildcards (`params.push(query.type)`), so `fc.code/fc.label/f.mime_type ILIKE
 * $N` required an EXACT case-insensitive match. Live-reproduced: the Filters panel's "Type filter"
 * (placeholder "Category code, label, mime type") returned 0 rows for "medical" against a real row
 * whose Type column literally reads "DOT Medical Card" — only the full exact string worked. Every
 * other search box in this app (list-page "Search rows...", maintenance parts/services `q.search`)
 * promises substring matching via `%${value}%`; this endpoint silently did not, with no error and
 * no hint that an exact string was required.
 *
 * Guard: the type-filter param must be wrapped `%${query.type}%` before hitting ILIKE, matching the
 * established convention used by services.routes.ts / parts.routes.ts / audit-reports.routes.ts.
 *
 * Usage:
 *   node scripts/verify-docs-type-filter-substring-match.mjs
 *   node scripts/verify-docs-type-filter-substring-match.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-docs-type-filter-substring-match";
const ROUTES = "apps/backend/src/docs/docs.routes.ts";

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function collectProblems(src) {
  const problems = [];
  const s = stripComments(src);

  if (/params\.push\(query\.type\)/.test(s)) {
    problems.push(
      `${ROUTES}: type-filter param pushed raw (params.push(query.type)) — ILIKE requires an exact match; wrap with wildcards: params.push(\`%\${query.type}%\`)`,
    );
  }
  if (!/params\.push\(\s*`%\$\{query\.type\}%`\s*\)/.test(s)) {
    problems.push(
      `${ROUTES}: type-filter param must be wrapped params.push(\`%\${query.type}%\`) so ILIKE does a substring match, matching the placeholder's promise ("Category code, label, mime type") and every other search box in this app`,
    );
  }
  return problems;
}

const good = `
      if (query.type) {
        params.push(\`%\${query.type}%\`);
        const idx = params.length;
        whereClauses.push(\`(fc.code ILIKE $\${idx} OR fc.label ILIKE $\${idx} OR f.mime_type ILIKE $\${idx})\`);
      }
`;
const bad = `
      if (query.type) {
        params.push(query.type);
        const idx = params.length;
        whereClauses.push(\`(fc.code ILIKE $\${idx} OR fc.label ILIKE $\${idx} OR f.mime_type ILIKE $\${idx})\`);
      }
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
console.log(`${LABEL}: PASS — docs Type filter does a substring ILIKE match, not exact-only`);
process.exit(0);
