#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","docs","customers"],"cols":["load","customer","connectivity","reverse_link","picker_law","qbo_chrome"],"leaves":["docs.ocr","book_load.ocr_prefill"],"task":"DSP-F6936-OCR-QUEUE-AND-CUSTOMER-MATCH-SILENT-CAPS","vertical":"class-sweep"} */
import fs from "node:fs";
const service = fs.readFileSync("apps/backend/src/dispatch/ocr-processor.service.ts", "utf8");
const page = fs.readFileSync("apps/frontend/src/pages/dispatch/OcrQueuePage.tsx", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/dispatch.ts", "utf8");
const book = fs.readFileSync("apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx", "utf8");
function between(source, start, end) { return source.slice(source.indexOf(start), source.indexOf(end)); }
function failures(s, p, a, b) {
  const queue = between(s, "export async function listOcrIntakeQueue", "export async function createOcrIntakeFromEmail");
  const match = between(s, "async function fuzzyMatchCustomer", "export async function getOcrIntakeConvertPrefill");
  const out = [];
  if (!queue.includes("dispatch.ocr_intake_queue") || !queue.includes("operating_company_id = $1::uuid")) out.push("queue company scope missing");
  if (/LIMIT\s+200/i.test(queue)) out.push("OCR queue still caps at 200");
  if (!queue.includes("ORDER BY created_at DESC, id DESC")) out.push("queue stable ordering missing");
  if (!match.includes("mdata.customers") || !match.includes("operating_company_id = $1::uuid") || !match.includes("deactivated_at IS NULL")) out.push("customer candidate scope missing");
  if (/LIMIT\s+500/i.test(match)) out.push("customer matcher still caps at 500");
  if (!match.includes("ORDER BY customer_name ASC, id ASC")) out.push("customer tie ordering missing");
  if (!p.includes("getOcrIntakeQueue(companyId)") || !p.includes("BookLoadModal")) out.push("mounted queue/creator missing");
  if (!a.includes("/api/v1/dispatch/ocr-intake/queue")) out.push("queue API missing");
  if (!b.includes("ocr_source_pdf_r2_key") || !b.includes("templatePrefillJson")) out.push("Book Load OCR prefill binding missing");
  return out;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    [service.replace("ORDER BY created_at DESC, id DESC", "ORDER BY created_at DESC\n        LIMIT 200"),page,api,book],
    [service.replace("ORDER BY customer_name ASC, id ASC", "LIMIT 500"),page,api,book],
    [service.replaceAll("operating_company_id = $1::uuid", "true"),page,api,book],
    [service,page.replace("getOcrIntakeQueue(companyId)", "Promise.resolve({ items: [] })"),api,book],
  ];
  const missed = mutations.filter((parts) => failures(...parts).length === 0);
  if (missed.length) { console.error(`FAIL: selftest missed ${missed.length}`); process.exit(1); }
  console.log(`PASS: selftest caught ${mutations.length} OCR range regressions`); process.exit(0);
}
const out = failures(service,page,api,book);
if (out.length) { console.error(`FAIL: ${out.join("; ")}`); process.exit(1); }
console.log("PASS: OCR queue and canonical customer matching are complete, scoped, deterministic, and bound to Book Load");
