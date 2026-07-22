#!/usr/bin/env node
/**
 * Rule-17 guard: JE detail must call source-links API and render EntityLinks including invoice (Law §9 P-INVOICE).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-je-detail-source-links";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertJeDetailSourceLinks() {
  const errors = [];
  const page = read("apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx");
  const api = read("apps/frontend/src/api/accounting.ts");
  const routes = read("apps/backend/src/accounting/journal-entries.routes.ts");

  if (!/\/api\/v1\/accounting\/journal-entries\/:id\/source-links/.test(routes)) {
    errors.push("backend: source-links route must remain mounted");
  }
  if (!/export function getJournalEntrySourceLinks\(/.test(api)) {
    errors.push("api: getJournalEntrySourceLinks client missing");
  }
  if (!/source-links/.test(api)) {
    errors.push("api: client must hit .../source-links");
  }
  if (!/getJournalEntrySourceLinks/.test(page)) {
    errors.push("JournalEntryDetailPage: must call getJournalEntrySourceLinks");
  }
  if (!/source-links/.test(page) && !/Source links/.test(page)) {
    errors.push("JournalEntryDetailPage: must reference source-links UI");
  }
  if (!/EntityLink/.test(page)) {
    errors.push("JournalEntryDetailPage: must render EntityLink for source drill-through");
  }
  if (!/case ["']invoice["']/.test(page)) {
    errors.push("JournalEntryDetailPage: must map invoice source type to EntityLink");
  }
  if (!/case ["']customer_payment["']/.test(page) && !/customer_payment/.test(page)) {
    errors.push("JournalEntryDetailPage: must map customer_payment source type");
  }
  return errors;
}

function selftest() {
  const errors = assertJeDetailSourceLinks();
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED — live sources rejected: ${errors.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertJeDetailSourceLinks();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
