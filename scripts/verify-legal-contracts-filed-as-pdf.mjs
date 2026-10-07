#!/usr/bin/env node
/**
 * GUARD (ROUND 435): every legal contract instance is FILED — a PDF in docs.files, linked both ways, filed at its hub —
 * and Legal shows contracts by category.
 *
 * MEASURED 2026-10-06 (prod): USMCA's 3 contract instances (2 draft, 1 voided) had nothing to open; the PDF existed only
 * at e-signature, in documents.attachments, outside docs.files and every hub.
 *
 * STATIC
 *   1. creation files a draft PDF; signature files the executed PDF (the signed bytes, not a re-render)
 *   2. the open route files a contract that has none (ensureContractPdfFiled)
 *   3. an insurer's first bill picks up its contracts (fileInsurerContractsOnFirstBill in the policy bill schedule)
 *   4. the hub rule reads the contract's typed links; the migration admits entity_type 'contract_instance' and adds
 *      contract_instances.pdf_file_id
 *   5. the list returns pdf_file_id + category; the page renders by category and opens the filed PDF
 * LIVE
 *   USMCA contract instances with no filed PDF — shrink-only from 3 (opening a contract files it). Before migration
 *   202615430900 is applied the column does not exist: PENDING DEPLOY, then the ceiling applies. No DATABASE_URL = FAIL.
 * Run: node scripts/verify-legal-contracts-filed-as-pdf.mjs [--selftest]
 *
 * REQUIRES_LIVE_DB — skipped by no-DB static sweep; fail-closed under the money gate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-legal-contracts-filed-as-pdf";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
export const UNFILED_CEILING = 0; // STALE-LITERAL-OK: measured live 2026-10-06 (3 -> 0 once opened), shrink-only
const F = {
  service: "apps/backend/src/legal/contracts.service.ts",
  engine: "apps/backend/src/legal/contract-document.service.ts",
  routes: "apps/backend/src/legal/contracts.routes.ts",
  billing: "apps/backend/src/insurance/policy-bill-schedule.service.ts",
  migration: "db/migrations/202615430900_legal_contract_pdf_filed.sql",
  page: "apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx",
  api: "apps/frontend/src/api/legal-contracts.ts",
};

export function staticProblems(src) {
  const p = [];
  const create = src.service.slice(src.service.indexOf("export async function createContractInstance"), src.service.indexOf("export async function sendContractSigningLink"));
  if (!/fileContractPdfBestEffort\([\s\S]{0,300}stage:\s*"draft"/.test(create)) p.push("createContractInstance does not file a draft PDF at creation");
  const sign = src.service.slice(src.service.indexOf("export async function completePublicSigning"));
  if (!/fileContractPdfBestEffort\([\s\S]{0,400}stage:\s*"signed"[\s\S]{0,200}signedPdf:\s*\{\s*pdfBuffer:\s*pdf\.pdfBuffer/.test(sign)) p.push("completePublicSigning does not file the EXECUTED PDF bytes");
  if (!/"\/api\/v1\/legal\/contracts\/:id\/pdf-file"[\s\S]{0,1200}ensureContractPdfFiled\(/.test(src.routes)) p.push("no open route that files a contract with no PDF");
  if (!/fileInsurerContractsOnFirstBill\(/.test(src.billing)) p.push("the insurance bill schedule does not file carrier contracts on the first bill");
  if (!/export function contractHubs/.test(src.engine) || !/INSERT INTO docs\.files/.test(src.engine) || !/entity_type: "contract_instance"/.test(src.engine) || !/SET pdf_file_id/.test(src.engine))
    p.push("contract-document engine must store in docs.files, link file->contract and set contract->file, and file at hubs");
  if (!/'contract_instance'::text/.test(src.migration) || !/ADD COLUMN IF NOT EXISTS pdf_file_id/.test(src.migration)) p.push("migration must admit contract_instance links and add pdf_file_id");
  if (!/ci\.pdf_file_id,\s*\n\s*ct\.category/.test(src.service)) p.push("the contract list does not return pdf_file_id and category");
  if (!/categorySections/.test(src.page) || !/filedPdf\(/.test(src.page)) p.push("Legal Contracts must render by category and open the filed PDF");
  if (!/pdf-file`/.test(src.api)) p.push("frontend API has no filed-PDF call");
  // 2026-10-06: contracts filed before the legal-document format kept showing the old layout. The filed PDF records its
  // format; opening an UNSIGNED contract with an older format re-files it; an EXECUTED contract is never re-rendered.
  if (!/pdf_format_version = \$4/.test(src.engine)) p.push("the engine does not stamp pdf_format_version on the filed PDF");
  if (!/executed \|\| Number\(cur\.v\) >= CONTRACT_PDF_FORMAT_VERSION/.test(src.engine)) p.push("open does not re-file a stale unsigned PDF (or would re-render an executed one)");
  if (!/parent_file_id, version_number/.test(src.engine)) p.push("a re-file must be a new docs.files version pointing at the one it supersedes");
  return p;
}

export function liveProblems({ columnExists, unfiled }) {
  if (!columnExists) return { failures: [], note: "PENDING DEPLOY: migration 202615430900 not applied yet" };
  if (unfiled > UNFILED_CEILING) return { failures: [`live: ${unfiled} USMCA contracts have no filed PDF > ceiling ${UNFILED_CEILING}`], note: "" };
  return { failures: [], note: `${unfiled} unfiled (ceiling ${UNFILED_CEILING}, shrink-only)` };
}

function selftest() {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  const good = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  const bad = [];
  if (staticProblems(good).length) bad.push(`the real tree is flagged: ${staticProblems(good).join("; ")}`);
  const m = (k, from, to) => ({ ...good, [k]: good[k].replace(from, to) });
  if (!staticProblems(m("service", 'stage: "draft"', 'stage: "nope"')).some((x) => /creation/.test(x))) bad.push("a create path that files nothing passed");
  if (!staticProblems(m("service", "pdfBuffer: pdf.pdfBuffer", "pdfBuffer: rerender()")).some((x) => /EXECUTED/.test(x))) bad.push("a re-rendered signed PDF passed");
  if (!staticProblems(m("billing", /fileInsurerContractsOnFirstBill\(/g, "noop(")).some((x) => /insurance/.test(x))) bad.push("an insurer billing path with no filing passed");
  if (!staticProblems(m("page", /categorySections/g, "rows")).some((x) => /category/.test(x))) bad.push("a flat Legal table passed");
  if (!staticProblems(m("engine", "executed || Number(cur.v) >= CONTRACT_PDF_FORMAT_VERSION", "cur.f")).some((x) => /stale unsigned/.test(x))) bad.push("an open that never re-files a stale PDF passed");
  if (liveProblems({ columnExists: true, unfiled: UNFILED_CEILING + 1 }).failures.length !== 1) bad.push("a growing unfiled count passed");
  if (liveProblems({ columnExists: false, unfiled: 99 }).failures.length !== 0) bad.push("pending deploy was failed");
  if (bad.length) { console.error(`${LABEL} SELFTEST FAILED:\n  - ${bad.join("\n  - ")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST OK — 8/8 (real tree passes; no-create-filing, re-rendered signed PDF, unfiled insurer bill, flat table, growing count each caught; pending deploy tolerated, stale-format re-file enforced)`);
  process.exit(0);
}
if (process.argv.includes("--selftest")) selftest();

const src = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
const problems = staticProblems(src);
let note = "";
if (!process.env.DATABASE_URL) problems.push("live: DATABASE_URL not set — unfiled contracts were not counted, and an unread count is not a pass");
else {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const col = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='legal' AND table_name='contract_instances' AND column_name='pdf_file_id'`)).rowCount > 0;
    const unfiled = col
      ? (await c.query(`SELECT count(*)::int n FROM legal.contract_instances WHERE operating_company_id = $1::uuid AND pdf_file_id IS NULL`, [USMCA])).rows[0].n
      : 0;
    await c.query("ROLLBACK");
    const live = liveProblems({ columnExists: col, unfiled });
    problems.push(...live.failures);
    note = live.note;
  } finally {
    await c.end();
  }
}
if (problems.length) { console.error(`${LABEL} FAIL\n  - ${problems.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL} OK — contracts file a PDF at creation and signature, open files the rest, insurers file on the first bill, Legal shows by category; live: ${note}`);
