#!/usr/bin/env node
/**
 * OWNER LAW 2026-10-02 — COMPETING-ENGINE AUDIT (Cursor lane: legal money poster).
 *
 * Canonical legal money = createBill / createExpandedInvoice via
 * apps/backend/src/legal/legal-money.service.ts. No second JE/bill/invoice mint
 * under apps/backend/src/legal/.
 *
 * FAILS IF:
 *   1) legal-money.service.ts loses createBill or createExpandedInvoice calls.
 *   2) Any other file under apps/backend/src/legal/ calls createBill /
 *      createExpandedInvoice / INSERT INTO accounting.(bills|invoices|journal_entries).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEGAL_DIR = path.join(ROOT, "apps/backend/src/legal");
const CANONICAL = "apps/backend/src/legal/legal-money.service.ts";

function walkTs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTs(full, out);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

export function checkCanonicalLegalMoney(source) {
  const problems = [];
  if (!/createBill\s*\(/.test(source)) {
    problems.push(`${CANONICAL}: must call createBill(...) for legal payables`);
  }
  if (!/createExpandedInvoice\s*\(/.test(source)) {
    problems.push(`${CANONICAL}: must call createExpandedInvoice(...) for legal receivables`);
  }
  if (/INSERT\s+INTO\s+accounting\.(bills|invoices|journal_entries)\b/i.test(source)) {
    problems.push(`${CANONICAL}: must not raw-INSERT accounting money tables — use createBill/createExpandedInvoice`);
  }
  return problems;
}

export function checkNoCompetingLegalPoster(files) {
  const problems = [];
  // Real call/import — ignore comment-only mentions of createBill / createExpandedInvoice.
  const forbidden =
    /(?:^|\n)\s*(?:import\s*\{[^}]*\b(?:createBill|createExpandedInvoice)\b|await\s+createBill\s*\(|await\s+createExpandedInvoice\s*\(|createBill\s*\(|createExpandedInvoice\s*\(|INSERT\s+INTO\s+accounting\.(?:bills|invoices|journal_entries)\b)/;
  for (const abs of files) {
    const rel = path.relative(ROOT, abs).split(path.sep).join("/");
    if (rel === CANONICAL) continue;
    // Strip line comments so prose like "posts through createBill" does not trip the guard.
    const src = fs
      .readFileSync(abs, "utf8")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
    if (forbidden.test(src)) {
      problems.push(
        `${rel}: competing legal money poster — only ${CANONICAL} may createBill / createExpandedInvoice / INSERT accounting money`
      );
    }
  }
  return problems;
}

export function run() {
  const problems = [];
  const abs = path.join(ROOT, CANONICAL);
  if (!fs.existsSync(abs)) {
    problems.push(`${CANONICAL}: file missing`);
  } else {
    problems.push(...checkCanonicalLegalMoney(fs.readFileSync(abs, "utf8")));
  }
  problems.push(...checkNoCompetingLegalPoster(walkTs(LEGAL_DIR)));
  return {
    ok: problems.length === 0,
    message:
      problems.length === 0
        ? "verify-competing-engine-legal-money-one-writer: OK — legal money posts only via legal-money.service createBill/createExpandedInvoice"
        : `verify-competing-engine-legal-money-one-writer FAILED:\n  - ${problems.join("\n  - ")}`,
  };
}

function selftest() {
  let failed = 0;
  const src = fs.readFileSync(path.join(ROOT, CANONICAL), "utf8");
  const mutated = src.replace(/createBill\s*\(/g, "retiredCreateBill(");
  if (checkCanonicalLegalMoney(mutated).length === 0) {
    console.error("SELFTEST FAIL: createBill removal not caught");
    failed++;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ce-legal-"));
  const fake = path.join(tmp, "evil.ts");
  fs.writeFileSync(fake, "await createBill(client, {});\n");
  if (checkNoCompetingLegalPoster([fake]).length === 0) {
    console.error("SELFTEST FAIL: competing createBill not caught");
    failed++;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  const baseline = run();
  if (!baseline.ok) {
    console.error("SELFTEST FAIL: baseline not green:\n" + baseline.message);
    failed++;
  }
  if (failed > 0) {
    console.error(`verify-competing-engine-legal-money-one-writer --selftest FAIL (${failed})`);
    process.exit(1);
  }
  console.log("verify-competing-engine-legal-money-one-writer --selftest PASS");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else {
    const result = run();
    console.log(result.message);
    process.exit(result.ok ? 0 : 1);
  }
}
