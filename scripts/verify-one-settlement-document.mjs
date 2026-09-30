#!/usr/bin/env node
/**
 * GUARD: there is exactly ONE driver settlement document.
 *
 * WHY (owner, 2026-09-30): "create the company, driver settlements exactly as the render you
 * provided" -- and before this there were TWO, which did not look alike:
 *   - GET .../driver-finance/settlements/:id.html rendered the locked v10 sheet through
 *     renderSettlementBody() -- IBM Plex, one load block per load, pickup/delivery legs,
 *     subtotals, the totals strip.
 *   - settlement-pdf-renderer.service.ts built its own markup: `font-family: Arial`, 12px, a
 *     border around every cell, a flat list of lines, no load blocks, no legs, no strip.
 * Same settlement, two papers, and the PDF was the one the driver was handed. A pay document that
 * does not match the statement on screen is the fastest way to make pay look wrong when it is not.
 *
 * The rule: the PDF renderer must go through buildDriverSettlementDocument and must not carry a
 * document template of its own.
 *
 * Usage:  node scripts/verify-one-settlement-document.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-one-settlement-document";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PDF = "apps/backend/src/driver-finance/settlement-pdf-renderer.service.ts";
const ROUTE = "apps/backend/src/driver-finance/settlement-render.routes.ts";
const DOC = "apps/backend/src/driver-finance/settlement-document.service.ts";

export function assertOneSettlementDocument({ pdf, route, doc }) {
  const problems = [];

  if (!/export async function buildDriverSettlementDocument/.test(doc)) {
    problems.push(`${DOC}: buildDriverSettlementDocument is gone -- there is no single document builder left.`);
    return problems;
  }
  if (!/renderSettlementBody\(/.test(doc)) {
    problems.push(`${DOC}: the builder no longer renders through renderSettlementBody() -- the locked v10 sheet.`);
  }

  for (const [name, src] of [[PDF, pdf], [ROUTE, route]]) {
    if (!/buildDriverSettlementDocument\(/.test(src)) {
      problems.push(`${name}: does not render through buildDriverSettlementDocument. Two settlement documents will drift apart again.`);
    }
  }

  // The PDF renderer must not grow its own template back.
  if (/<!doctype html>/i.test(pdf)) {
    problems.push(
      `${PDF}: carries its own <!doctype html> document again. The PDF must be the SAME paper as the on-screen ` +
        `statement -- render through buildDriverSettlementDocument + wrapPdfDocument(skin:"v10").`
    );
  }
  if (/font-family:\s*Arial/i.test(pdf)) {
    problems.push(
      `${PDF}: declares its own Arial font stack. That is the exact shape of the document this guard replaced -- ` +
        `the settlement sheet's typography belongs to the v10 stylesheet, not to the PDF renderer.`
    );
  }
  if (!/skin: "v10"/.test(pdf)) {
    problems.push(`${PDF}: no longer wraps with skin:"v10", so the PDF would print in a different skin from the screen.`);
  }

  return problems;
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

if (process.argv.includes("--selftest")) {
  const failures = [];
  const live = { pdf: read(PDF), route: read(ROUTE), doc: read(DOC) };
  const expect = (name, mutated, needle) => {
    const problems = assertOneSettlementDocument(mutated);
    if (!problems.some((p) => p.includes(needle))) failures.push(`${name}: planted defect NOT caught (got: ${problems.join(" | ") || "none"})`);
  };

  const now = assertOneSettlementDocument(live);
  if (now.length) failures.push(`live: ${now.join(" | ")}`);

  // 1. THE REGRESSION -- the PDF renderer builds its own document again.
  expect("pdf-own-template", { ...live, pdf: live.pdf.replace("const html = wrapPdfDocument(", "const html = `<!doctype html><html><body>x</body></html>`; void wrapPdfDocument(") }, "its own <!doctype html>");
  // 2. Arial creeps back.
  expect("arial-back", { ...live, pdf: live.pdf + "\nconst legacy = `body { font-family: Arial, sans-serif; }`;\n" }, "own Arial font stack");
  // 3. The PDF stops using the shared builder.
  expect("pdf-detached", { ...live, pdf: live.pdf.replace(/buildDriverSettlementDocument\(/g, "legacyBuild(") }, `${PDF}: does not render through`);
  // 4. The HTML route stops using it.
  expect("route-detached", { ...live, route: live.route.replace(/buildDriverSettlementDocument\(/g, "legacyBuild(") }, `${ROUTE}: does not render through`);
  // 5. The skin is changed so the two print differently.
  expect("skin-changed", { ...live, pdf: live.pdf.replace('skin: "v10"', 'skin: "house"') }, 'no longer wraps with skin:"v10"');
  // 6. The builder stops using the locked template.
  expect("template-detached", { ...live, doc: live.doc.replace(/renderSettlementBody\(/g, "otherBody(") }, "renderSettlementBody()");
  // 7. The builder is deleted.
  expect("builder-deleted", { ...live, doc: live.doc.replace("export async function buildDriverSettlementDocument", "async function buildDriverSettlementDocument") }, "is gone");

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED (${failures.length})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} selftest 7/7 OK`);
  }
} else {
  const problems = assertOneSettlementDocument({ pdf: read(PDF), route: read(ROUTE), doc: read(DOC) });
  if (problems.length) {
    console.error(`${LABEL} FAILED (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
