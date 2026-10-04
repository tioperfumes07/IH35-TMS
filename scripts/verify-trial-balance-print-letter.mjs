#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SELF = path.join(ROOT, "scripts/verify-trial-balance-print-letter.mjs");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/reports/TrialBalancePage.tsx");
const HELPER = path.join(ROOT, "apps/frontend/src/lib/openPrintableDocument.ts");

function fail(msg) {
  console.error(`FAIL verify-trial-balance-print-letter: ${msg}`);
  process.exit(1);
}

function assertSource() {
  if (!fs.existsSync(PAGE)) fail("missing TrialBalancePage");
  if (!fs.existsSync(HELPER)) fail("missing openPrintableDocument");
  const helper = fs.readFileSync(HELPER, "utf8");
  if (!helper.includes("export function printLetterHtml")) fail("missing printLetterHtml");
  const page = fs.readFileSync(PAGE, "utf8");
  if (!page.includes("printLetterHtml")) fail("TrialBalancePage must use printLetterHtml");
  if (!/onClick=\{printLetter\}/.test(page)) fail("Print must call printLetter");
  if (/onClick=\{\(\) => window\.print\(\)\}/.test(page)) fail("must not window.print() on SPA");
  if (page.includes("text-[11px]")) fail("TrialBalancePage.tsx: must not use text-[11px] — use text-section-header");
}

function selftest() {
  assertSource();
  const backup = fs.readFileSync(PAGE, "utf8");
  // Plant into a mkdtemp mirror of the tree (script + files it reads); never write tracked source.
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "verify-trial-balance-print-letter-"));
  try {
    const planted = backup.replace(/onClick=\{printLetter\}/, 'onClick={() => window.print()}');
    for (const abs of [SELF, HELPER, PAGE]) {
      const dest = path.join(tmpRoot, path.relative(ROOT, abs));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(abs, dest);
    }
    fs.writeFileSync(
      path.join(tmpRoot, path.relative(ROOT, PAGE)),
      planted.includes("window.print()") ? planted : `${backup}\nonClick={() => window.print()}\n`,
    );
    const r = spawnSync(process.execPath, [path.join(tmpRoot, path.relative(ROOT, SELF))], { encoding: "utf8" });
    if (r.status === 0) fail("mutated still passed");
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  console.log("PASS: verify-trial-balance-print-letter --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log("PASS: verify-trial-balance-print-letter");
}
