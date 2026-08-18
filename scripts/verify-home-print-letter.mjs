#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SELF = path.join(ROOT, "scripts/verify-home-print-letter.mjs");
const PAGES = [
  path.join(ROOT, "apps/frontend/src/pages/home/OwnerHome.tsx"),
  path.join(ROOT, "apps/frontend/src/pages/home/roles/DefaultHome.tsx"),
  path.join(ROOT, "apps/frontend/src/pages/home/roles/AccountingHome.tsx"),
];
const HELPER = path.join(ROOT, "apps/frontend/src/lib/openPrintableDocument.ts");

function fail(msg) {
  console.error(`FAIL verify-home-print-letter: ${msg}`);
  process.exit(1);
}

function assertSource() {
  if (!fs.existsSync(HELPER)) fail("missing openPrintableDocument");
  const helper = fs.readFileSync(HELPER, "utf8");
  if (!helper.includes("export function printLetterHtml")) fail("missing printLetterHtml");
  for (const page of PAGES) {
    if (!fs.existsSync(page)) fail(`missing ${path.relative(ROOT, page)}`);
    const src = fs.readFileSync(page, "utf8");
    if (!src.includes("printLetterHtml")) fail(`${path.basename(page)} must use printLetterHtml`);
    if (!/onClick=\{printLetter\}/.test(src)) fail(`${path.basename(page)} Print must call printLetter`);
    if (/onClick=\{\(\) => window\.print\(\)\}/.test(src)) fail(`${path.basename(page)} must not window.print() on SPA`);
  }
}

function selftest() {
  assertSource();
  const target = PAGES[0];
  const backup = fs.readFileSync(target, "utf8");
  try {
    const planted = backup.replace(/onClick=\{printLetter\}/, "onClick={() => window.print()}");
    fs.writeFileSync(target, planted.includes("window.print()") ? planted : `${backup}\nonClick={() => window.print()}\n`);
    const r = spawnSync(process.execPath, [SELF], { encoding: "utf8" });
    if (r.status === 0) fail("mutated still passed");
  } finally {
    fs.writeFileSync(target, backup);
  }
  console.log("PASS: verify-home-print-letter --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log("PASS: verify-home-print-letter");
}
