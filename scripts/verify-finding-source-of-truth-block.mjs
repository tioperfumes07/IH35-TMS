#!/usr/bin/env node
/**
 * FINDING SOURCE-OF-TRUTH BLOCK LAW (2026-08-28).
 * New OPEN/FINDING material in docs/audit must carry:
 *   SOURCE-OF-TRUTH: … — proven at <file:line>
 *   I QUERIED: …
 *   NOT CHECKED: …
 * LOOKALIKE pairs from docs/specs/SOURCE-OF-TRUTH-MAP.md: if SOURCE names CANONICAL
 * and I QUERIED names only the LOOKALIKE (or vice versa), FAIL.
 *
 * Scope: origin/main..HEAD additions under docs/audit/ (GUARD-WORKORDERS + *FINDING*).
 * Whole-file grandfather: historical rows without the block are not scanned unless added in this PR.
 *
 * Wire: CC-2 claim ≡3 then scripts/verify-steps/NNNN-verify-finding-source-of-truth-block.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAP = path.join(ROOT, "docs/specs/SOURCE-OF-TRUTH-MAP.md");
const LAW = path.join(ROOT, "docs/lockdown/FINDING-SOURCE-OF-TRUTH-BLOCK-LAW-2026-08-28.md");

const LABELS = ["SOURCE-OF-TRUTH:", "I QUERIED:", "NOT CHECKED:"];

function parseLookalikes(md) {
  const pairs = [];
  for (const line of md.split("\n")) {
    if (!line.startsWith("|") || line.includes("CANONICAL") || line.includes("---")) continue;
    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length < 3) continue;
    const canon = cells[1].replace(/`/g, "").split("(")[0].trim();
    const look = cells[2].replace(/`/g, "").split("(")[0].trim();
    if (canon && look && canon !== "Question") pairs.push({ canonical: canon, lookalike: look });
  }
  return pairs;
}

function hasAllLabels(text) {
  return LABELS.every((l) => text.includes(l));
}

function mismatchLookalike(text, pairs) {
  const src = (text.match(/SOURCE-OF-TRUTH:\s*([^\n]+)/i) || [])[1] || "";
  const qry = (text.match(/I QUERIED:\s*([^\n]+)/i) || [])[1] || "";
  const blob = `${src}\n${qry}`.toLowerCase();
  for (const { canonical, lookalike } of pairs) {
    const c = canonical.toLowerCase();
    const l = lookalike.toLowerCase();
    if (!c || !l) continue;
    const srcHasC = src.toLowerCase().includes(c);
    const srcHasL = src.toLowerCase().includes(l);
    const qryHasC = qry.toLowerCase().includes(c);
    const qryHasL = qry.toLowerCase().includes(l);
    // SOURCE names canonical, query only names lookalike (not canonical) → false finding class
    if (srcHasC && qryHasL && !qryHasC) {
      return `SOURCE-OF-TRUTH names ${canonical} but I QUERIED only names lookalike ${lookalike}`;
    }
    if (srcHasL && qryHasC && !srcHasC) {
      return `SOURCE-OF-TRUTH names lookalike ${lookalike} but I QUERIED names canonical ${canonical}`;
    }
    void blob;
  }
  return null;
}

function gitDiffAddedAudit() {
  try {
    return execSync("git diff --unified=0 origin/main...HEAD -- docs/audit/", {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    return e.stdout || "";
  }
}

function extractAddedChunks(diff) {
  const chunks = [];
  let file = null;
  let buf = [];
  const flush = () => {
    if (file && buf.length) chunks.push({ file, text: buf.join("\n") });
    buf = [];
  };
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      flush();
      file = line.slice(6);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      buf.push(line.slice(1));
    }
  }
  flush();
  return chunks;
}

function isFindingMaterial(text) {
  // Closeouts / already-fixed stamps do not re-litigate the SOT block.
  if (/\|\s*\*\*FIXED/.test(text) || /\bSUPERSEDED\b/.test(text) || /\bVERIFIED\b/.test(text)) {
    return false;
  }
  return (
    /\bFINDING\b/i.test(text) ||
    /\|\s*\*\*OPEN/.test(text) ||
    /\|\s*\*\*OPEN HANDOFF/.test(text) ||
    /SOURCE-OF-TRUTH:/.test(text)
  );
}

function auditDiff(diff, pairs) {
  const errors = [];
  for (const { file, text } of extractAddedChunks(diff)) {
    if (!file.startsWith("docs/audit/")) continue;
    if (!isFindingMaterial(text)) continue;
    // N/A / ACK / meter walks without a defect claim skip
    if (/FINDING:\s*N\/A/i.test(text) && !/SOURCE-OF-TRUTH:/.test(text) && !/\|\s*\*\*OPEN/.test(text)) {
      continue;
    }
    if (!hasAllLabels(text)) {
      errors.push(`${file}: new FINDING/OPEN material missing SOURCE-OF-TRUTH: / I QUERIED: / NOT CHECKED:`);
      continue;
    }
    const mm = mismatchLookalike(text, pairs);
    if (mm) errors.push(`${file}: ${mm}`);
  }
  return errors;
}

function run() {
  if (!fs.existsSync(LAW) || !fs.existsSync(MAP)) {
    console.error("verify-finding-source-of-truth-block FAIL — law or map missing");
    process.exit(1);
  }
  const pairs = parseLookalikes(fs.readFileSync(MAP, "utf8"));
  if (pairs.length < 3) {
    console.error("verify-finding-source-of-truth-block FAIL — SOURCE-OF-TRUTH-MAP.md has too few pairs");
    process.exit(1);
  }
  const diff = gitDiffAddedAudit();
  const errors = auditDiff(diff, pairs);
  if (errors.length) {
    console.error(`verify-finding-source-of-truth-block FAIL:\n${errors.map((e) => ` - ${e}`).join("\n")}`);
    process.exit(1);
  }
  console.log(
    `verify-finding-source-of-truth-block OK — ${pairs.length} lookalike pairs; audit diff additions clean`,
  );
}

function selftest() {
  const pairs = [
    {
      canonical: "accounting.chart_of_accounts_roles",
      lookalike: "catalogs.account_role_bindings",
    },
  ];
  const badMissing = "+| **OPEN** `X` — roles unbound | evidence | **OPEN** |";
  const badMismatch =
    "+SOURCE-OF-TRUTH: accounting.chart_of_accounts_roles — proven at resolver.service.ts:246\n" +
    "+I QUERIED: SELECT count(*) FROM catalogs.account_role_bindings\n" +
    "+NOT CHECKED: USMCA vs TRANSP\n";
  const good =
    "+SOURCE-OF-TRUTH: accounting.chart_of_accounts_roles — proven at apps/backend/src/accounting/coa-roles/resolver.service.ts:246\n" +
    "+I QUERIED: SELECT role, account_id FROM accounting.chart_of_accounts_roles WHERE operating_company_id = $USMCA AND is_active\n" +
    "+NOT CHECKED: legacy catalogs.account_role_bindings fallback path; sample GL\n";

  const d1 = `+++ b/docs/audit/GUARD-WORKORDERS.md\n${badMissing}\n`;
  const d2 = `+++ b/docs/audit/GUARD-WORKORDERS.md\n${badMismatch}\n`;
  const d3 = `+++ b/docs/audit/GUARD-WORKORDERS.md\n${good}\n`;

  if (auditDiff(d1, pairs).length < 1) throw new Error("selftest: missing labels not caught");
  if (auditDiff(d2, pairs).length < 1) throw new Error("selftest: lookalike mismatch not caught");
  if (auditDiff(d3, pairs).length !== 0) throw new Error("selftest: good block falsely failed");
  if (!fs.existsSync(LAW) || !fs.existsSync(MAP)) throw new Error("selftest: law/map missing");
  console.log("verify-finding-source-of-truth-block --selftest PASS — 3/3 planted cases");
}

if (process.argv.includes("--selftest")) selftest();
else run();
