#!/usr/bin/env node
/**
 * verify-dead-forms-unmounted.mjs  (D-CREATE-VERIFY — the "nothing gets created / looks like shit" root cause)
 *
 * The owner-reported bug is NOT that create logic is missing — a sweep (2026-07-11) confirmed the LIVE
 * create forms are wired. The rot is dead/superseded forms that must stay OFF the live surface:
 *   - the @archived Workflow-B banking categorization chain (superseded by BankingTransactionsDesignView),
 *   - the orphan maintenance WorkOrderCreateModal (0 importers, no submit).
 * If one of these gets re-imported into a routed/mounted component, the user sees a stale form that renders
 * but never persists ("nothing gets created") and doesn't match the QBO surface ("looks like shit").
 *
 * This guard proves those dead modules remain UNMOUNTED: every importer of a dead module must be either a
 * TEST file or ANOTHER dead-cluster module. A live (non-test) importer outside the dead set = FAIL (re-mount).
 * It does NOT rebuild or delete anything — archive-not-delete; it only enforces un-mountedness.
 *
 * Companion to verify-banking-workflow-b-archived.mjs (which asserts the files stay present + @archived);
 * this adds the missing "and stay unreachable from the live UI" proof.
 *
 * Usage:
 *   node scripts/verify-dead-forms-unmounted.mjs            # scan
 *   node scripts/verify-dead-forms-unmounted.mjs --selftest # inject a live import of a dead form -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  DEAD_FORM_BASENAMES,
  DEAD_FORM_MODULE_SUFFIXES,
  DEAD_FORM_TSX_PATH_SET,
} from "./dead-form-modules.mjs";

const repoRoot = process.cwd();
const SCAN_ROOT = "apps/frontend/src";

const DEAD_MODULES = DEAD_FORM_MODULE_SUFFIXES;
const DEAD_BASENAMES = DEAD_FORM_BASENAMES;
const DEAD_RELSET = DEAD_FORM_TSX_PATH_SET;

function isTestFile(rel) {
  return /\.test\.[tj]sx?$/.test(rel) || /(^|\/)__tests__\//.test(rel);
}
function isDeadFile(rel) {
  return DEAD_RELSET.has(rel);
}

// Import specifiers in a source file that reference one of the dead basenames.
function importsDeadModule(src) {
  const hits = new Set();
  const importRe = /\bfrom\s*["']([^"']+)["']/g;
  let m;
  while ((m = importRe.exec(src)) !== null) {
    const spec = m[1];
    const base = spec.split("/").pop();
    if (DEAD_BASENAMES.has(base)) hits.add(base);
  }
  return [...hits];
}

function listSrc(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      listSrc(full, out);
    } else if (/\.[tj]sx?$/.test(entry.name)) {
      out.push(full);
    }
  }
}

function scan() {
  const files = [];
  const abs = path.join(repoRoot, SCAN_ROOT);
  if (fs.existsSync(abs)) listSrc(abs, files);
  const offenders = [];
  for (const full of files) {
    const rel = path.relative(repoRoot, full);
    if (isTestFile(rel) || isDeadFile(rel)) continue; // tests + dead-cluster internals may reference dead modules
    const dead = importsDeadModule(fs.readFileSync(full, "utf8"));
    if (dead.length) offenders.push(`${rel} imports dead form(s): ${dead.join(", ")}`);
  }
  return offenders;
}

export function run() {
  const offenders = scan();
  if (offenders.length) {
    console.error("[verify-dead-forms-unmounted] FAIL — a dead/@archived form was mounted onto the live surface:");
    for (const o of offenders) console.error(`  - ${o}`);
    return { ok: false, offenders };
  }
  console.log(`[verify-dead-forms-unmounted] PASS — ${DEAD_MODULES.length} dead forms remain unmounted (test/dead-cluster refs only)`);
  return { ok: true, offenders: [] };
}

export function check() {
  return run().ok;
}

function selftest() {
  const liveImport = `import { CategorizeDrawer } from "../banking/components/CategorizeDrawer";\nexport const Page = () => <CategorizeDrawer/>;`;
  if (importsDeadModule(liveImport).length === 0) {
    console.error("[verify-dead-forms-unmounted] SELFTEST FAIL — live import of a dead form not detected");
    process.exit(1);
  }
  const okImport = `import { BankingTransactionsDesignView } from "./components/BankingTransactionsDesignView";`;
  if (importsDeadModule(okImport).length !== 0) {
    console.error("[verify-dead-forms-unmounted] SELFTEST FAIL — false positive on the live replacement view");
    process.exit(1);
  }
  console.log("[verify-dead-forms-unmounted] SELFTEST PASS — detects a re-mounted dead form; ignores the live view");
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
