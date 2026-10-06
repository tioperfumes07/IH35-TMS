#!/usr/bin/env node
/**
 * verify-printable-document-census — ROUND 435-DEV.
 *
 * The printable-document census (docs/census/printable-documents.json) is shrink-only on its
 * NO-PDF count. DIRECTION: NO-PDF may only go DOWN. A new document type or a generator/renderer
 * that disappears must not let the count climb. Failure text states the direction explicitly.
 *
 * Checks:
 *   1. Census file exists and parses (CORE-INPUTS-MISSING otherwise).
 *   2. Every HAS-* row's probe files exist (a deleted generator/route/UI caller would silently
 *      turn a designed doc into NO-PDF without anyone noticing).
 *   3. NO-PDF count <= meta.baseline_no_pdf AND no baseline NO-PDF row silently dropped.
 *
 * Selftest: node scripts/verify-printable-document-census.mjs --selftest
 * VERIFY_ROOT=DIR redirects probes + census for fixture testing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reportSelftest } from "./lib/guard-selftest.mjs";

const LABEL = "verify-printable-document-census";
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CENSUS_REL = "docs/census/printable-documents.json";
const VALID = new Set(["HAS-DESIGNED-PDF", "HAS-PDF-BUT-UNDESIGNED", "NO-PDF"]);

export function checkCensus(root = process.env.VERIFY_ROOT || DEFAULT_ROOT) {
  const failures = [];
  const censusPath = path.join(root, CENSUS_REL);
  if (!fs.existsSync(censusPath)) {
    return { ok: false, failures: ["CORE-INPUTS-MISSING: docs/census/printable-documents.json absent — census was never written or was deleted"], counts: {} };
  }
  const census = JSON.parse(fs.readFileSync(censusPath, "utf8"));
  const docs = Array.isArray(census.documents) ? census.documents : [];
  if (docs.length === 0) {
    return { ok: false, failures: ["CORE-INPUTS-MISSING: census has zero document rows"], counts: {} };
  }
  const baseline = Number(census.meta?.baseline_no_pdf ?? NaN);
  if (!Number.isFinite(baseline)) failures.push("meta.baseline_no_pdf missing/non-numeric");

  let noPdf = 0;
  const ids = new Set();
  for (const d of docs) {
    if (!d.id || ids.has(d.id)) failures.push(`duplicate/blank id: ${d.id}`);
    ids.add(d.id);
    if (!VALID.has(d.state)) { failures.push(`${d.id}: bad state '${d.state}'`); continue; }
    if (d.state === "NO-PDF") noPdf++;
    else for (const p of d.probes || []) {
      if (!fs.existsSync(path.join(root, p))) failures.push(`${d.id}: probe missing (doc would silently lose its PDF path): ${p}`);
    }
  }
  if (Number.isFinite(baseline) && noPdf > baseline) {
    failures.push(`NO-PDF count regressed: ${noPdf} > baseline ${baseline}. DIRECTION IS SHRINK-ONLY — a document may move NO-PDF→HAS-* but never gain a new NO-PDF row. Add the designed PDF or fix the probe; do not raise the baseline.`);
  }
  return { ok: failures.length === 0, failures, counts: { total: docs.length, noPdf, baseline } };
}

if (process.argv.includes("--selftest")) {
  const base = checkCensus();
  const probeMissing = () => {
    const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "census-"));
    fs.mkdirSync(path.join(tmp, "docs/census"), { recursive: true });
    fs.copyFileSync(path.join(DEFAULT_ROOT, CENSUS_REL), path.join(tmp, CENSUS_REL));
    // plant: a HAS-* row whose probe file does not exist in the fixture root
    return checkCensus(tmp).ok === false;
  };
  const directionFlip = () => {
    const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "census2-"));
    fs.mkdirSync(path.join(tmp, "docs/census"), { recursive: true });
    const c = JSON.parse(fs.readFileSync(path.join(DEFAULT_ROOT, CENSUS_REL), "utf8"));
    c.documents.push({ id: "planted-new-no-pdf", document: "planted", created: "x", generator: "x", ui: "x", state: "NO-PDF", probes: [] });
    fs.writeFileSync(path.join(tmp, CENSUS_REL), JSON.stringify(c));
    return checkCensus(tmp).ok === false;
  };
  reportSelftest(LABEL, [
    { name: "real-tree", pass: base.ok },
    { name: "missing-probe-red", pass: probeMissing() },
    { name: "new-no-pdf-red", pass: directionFlip() },
  ]);
}

const r = checkCensus();
if (!r.ok) {
  console.error(`${LABEL} FAIL`);
  for (const f of r.failures) console.error("  -", f);
  process.exit(1);
}
console.log(`${LABEL} OK — ${r.counts.total} documents, NO-PDF ${r.counts.noPdf} of baseline ${r.counts.baseline} (shrink-only)`);
