#!/usr/bin/env node
/**
 * GUARD: the company settlement must have a PDF, and it must be the SAME document as its screen.
 *
 * WHY (owner, 2026-09-30): "we need to get done also the company settlements pdfs not just driver."
 * He was right and it was missing ENTIRELY. Company settlements had exactly one render route --
 * `:id.html` -- and NO pdf endpoint at any spelling, while the driver settlement has had a real
 * `/pdf` all along. "Print the company settlement" meant opening a browser and pressing Cmd-P.
 *
 * The driver settlement already taught this lesson the expensive way: it HAD a PDF, and that PDF
 * was built from its own Arial template, so the paper a driver was handed did not match the
 * statement on screen. The company settlement gets the PDF it was missing AND the single-builder
 * shape at the same time, so it never has to learn that lesson separately.
 *
 * Usage:  node scripts/verify-company-settlement-has-pdf.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-company-settlement-has-pdf";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = "apps/backend/src/accounting/company-settlement-render.routes.ts";
const DOC = "apps/accounting/company-settlement-document.service.ts";
const DOC_REAL = "apps/backend/src/accounting/company-settlement-document.service.ts";

export function assertCompanySettlementPdf({ routes, doc }) {
  const problems = [];

  if (!/export async function buildCompanySettlementDocument/.test(doc)) {
    problems.push(`${DOC_REAL}: buildCompanySettlementDocument is gone — there is no single document builder.`);
    return problems;
  }
  if (!/renderCompanySettlementBody\(/.test(doc)) {
    problems.push(`${DOC_REAL}: the builder no longer renders through renderCompanySettlementBody() — the locked v10 sheet.`);
  }

  if (!/"\/api\/v1\/accounting\/company-settlements\/:id\/pdf"/.test(routes)) {
    problems.push(
      `${ROUTES}: the company settlement PDF route is gone. The owner asked for this because it never existed — ` +
        `printing a company settlement meant Cmd-P in a browser.`
    );
  }
  if (!/"\/api\/v1\/accounting\/company-settlements\/:id\.html"/.test(routes)) {
    problems.push(`${ROUTES}: the company settlement HTML route is gone.`);
  }

  // BOTH surfaces must go through the one builder.
  const calls = (routes.match(/buildCompanySettlementDocument\(/g) || []).length;
  if (calls < 2) {
    problems.push(
      `${ROUTES}: only ${calls} surface(s) call buildCompanySettlementDocument. BOTH the .html and the /pdf route ` +
        `must render the same document — that is the defect the driver settlement already paid for.`
    );
  }

  // The PDF must not grow a template of its own.
  if (/<!doctype html>/i.test(routes)) {
    problems.push(`${ROUTES}: carries its own <!doctype html>. The PDF must be the same paper as the screen, not a second template.`);
  }
  if (/font-family:\s*Arial/i.test(routes)) {
    problems.push(`${ROUTES}: declares its own Arial font stack — exactly the shape that made the driver PDF disagree with its screen.`);
  }
  if (!/application\/pdf/.test(routes)) {
    problems.push(`${ROUTES}: the PDF route no longer sends an application/pdf content type.`);
  }
  const v10 = (routes.match(/skin: "v10"/g) || []).length;
  if (v10 < 2) {
    problems.push(`${ROUTES}: only ${v10} surface(s) wrap with skin:"v10" — the PDF and the screen would print in different skins.`);
  }

  return problems;
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

if (process.argv.includes("--selftest")) {
  const failures = [];
  const live = { routes: read(ROUTES), doc: read(DOC_REAL) };
  const expect = (name, m, needle) => {
    const problems = assertCompanySettlementPdf(m);
    if (!problems.some((p) => p.includes(needle))) failures.push(`${name}: planted defect NOT caught (got: ${problems.join(" | ") || "none"})`);
  };

  const now = assertCompanySettlementPdf(live);
  if (now.length) failures.push(`live: ${now.join(" | ")}`);

  // 1. THE ORIGINAL STATE — no PDF route at all.
  expect("pdf-route-removed", { ...live, routes: live.routes.replace('"/api/v1/accounting/company-settlements/:id/pdf"', '"/api/v1/accounting/company-settlements/:id/other"') }, "PDF route is gone");
  // 2. The PDF detaches from the shared builder.
  expect("pdf-detached", { ...live, routes: live.routes.replace(/buildCompanySettlementDocument\(/g, (m, i) => (i > live.routes.indexOf("/pdf") ? "legacyBuild(" : m)) }, "surface(s) call buildCompanySettlementDocument");
  // 3. Its own template grows back.
  expect("own-template", { ...live, routes: live.routes + "\nconst legacy = `<!doctype html><html></html>`;\n" }, "its own <!doctype html>");
  // 4. Arial creeps in.
  expect("arial", { ...live, routes: live.routes + "\nconst s = `body { font-family: Arial; }`;\n" }, "own Arial font stack");
  // 5. The skins diverge.
  expect("skin-diverges", { ...live, routes: live.routes.replace(/skin: "v10"/g, (m, i) => (i > live.routes.indexOf("/pdf") ? 'skin: "house"' : m)) }, 'wrap with skin:"v10"');
  // 6. The builder abandons the locked template.
  expect("builder-detached", { ...live, doc: live.doc.replace(/renderCompanySettlementBody\(/g, "otherBody(") }, "renderCompanySettlementBody()");
  // 7. The builder is deleted.
  expect("builder-deleted", { ...live, doc: live.doc.replace("export async function buildCompanySettlementDocument", "async function buildCompanySettlementDocument") }, "is gone");

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED (${failures.length})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} selftest 7/7 OK`);
  }
} else {
  const problems = assertCompanySettlementPdf({ routes: read(ROUTES), doc: read(DOC_REAL) });
  if (problems.length) {
    console.error(`${LABEL} FAILED (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
