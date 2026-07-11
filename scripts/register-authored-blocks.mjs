#!/usr/bin/env node
/**
 * register-authored-blocks.mjs — register unregistered MASTER-6 authored blocks into .block-ready/
 *
 * HONEST EXTRACTION, NOT stub-generation. Every field is transcribed from the AUTHOR's real dispatch spec:
 *   block_id      ← filename (leading NN_ index + trailing _MARKER stripped)
 *   phase         ← the MASTER-6 phase folder
 *   classification← FINANCIAL when the dispatch carries financial/TIER-1/PROTECTED/accounting/posting/GL
 *                   markers, else NON-FINANCIAL
 *   allowed_files ← the dispatch "LANE LOCK:" scope (verbatim)
 *   acceptance[]  ← the dispatch "ACCEPTANCE[]:" bullets (verbatim); if the dispatch has none, the REQUIRED/
 *                   Title claim is used (still the author's real text) — NEVER a fabricated placeholder
 *   status        ← the dispatch's OWN honest marker: SUPERSEDED/DUP → superseded; STALE/VERIFY → NEEDS-VERIFY;
 *                   header [NOT-BUILT] → PENDING; [PARTIAL] → PARTIAL; [DONE]/_DONE → done; else NEEDS-VERIFY
 *
 * A block whose acceptance text can't be extracted at all is SKIPPED and reported (never registered hollow).
 * Dedups against the live registry (normalized id) so already-registered blocks are left untouched.
 *
 * Usage: node scripts/register-authored-blocks.mjs "<MASTER-6 path>" <phaseFolder> [--write]
 *   without --write it DRY-RUNS and prints the per-status tally + any skips.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const BLOCK_READY = path.join(repoRoot, ".block-ready");

const PHASE_BY_DIR = {
  "01-ENFORCEMENT-FIRST": "enforcement",
  "02-MONEY-WIRING-P1-P3": "money-wiring",
  "04-PHASE4-CROSS-MODULE": "phase4",
  "03-TIER1-BLOCKS": "tier1",
  "05-TIER2-BLOCKS": "tier2",
  "06-TIER3-BLOCKS": "tier3",
  "07-UI-DESIGN": "design-parity",
};

const norm = (s) => String(s).replace(/\.(txt|json)$/i, "").replace(/^[0-9]+_/, "").replace(/_(DISPATCH|VERIFY|SUPERSEDED|LIKELY-STALE|STALE|DUP|DUPLICATE|DONE|DESIGN|UI)$/i, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function registeredNormSet() {
  const set = new Set();
  if (fs.existsSync(BLOCK_READY)) for (const f of fs.readdirSync(BLOCK_READY)) if (f.endsWith(".json")) set.add(norm(f));
  return set;
}

function blockIdFromФile(fname) {
  return fname.replace(/\.txt$/i, "").replace(/^[0-9]+_/, "");
}

function classify(text) {
  return /\b(financial|TIER-1|TIER 1|PROTECTED|accounting\.|catalogs\.accounts|posting|\bGL\b|journal_entr|ledger|opening balance|reconcile-commit|bill_payment|settlement)\b/i.test(text)
    ? "FINANCIAL"
    : "NON-FINANCIAL";
}

function extractLane(text) {
  const m = /LANE LOCK:\s*([^\n]+(?:\n(?!\s*$)(?![A-Z][A-Z ]+:)[^\n]+)*)/i.exec(text);
  return m ? m[1].trim().replace(/\s+/g, " ").slice(0, 600) : null;
}

function extractAcceptance(text) {
  // ACCEPTANCE[] section: from the marker to the next ALL-CAPS section header (LANE LOCK / LINKAGE / etc.)
  const m = /ACCEPTANCE\[\]:\s*([\s\S]*?)(?:\n\s*(?:LANE LOCK|LINKAGE|LANE|STANDING ORDERS|PR target|NOTES?|$))/i.exec(text);
  const body = m ? m[1] : "";
  const items = body
    .split(/\n/)
    .map((l) => l.replace(/^[\s\-*•·]+/, "").trim())
    .filter((l) => l.length > 4 && !/^ACCEPTANCE/i.test(l));
  return items.map((check) => ({ check: check.slice(0, 400) }));
}

function extractClaim(text) {
  const m = /Title\/claim[^:]*:\s*([^\n]+)/i.exec(text) || /Title:\s*([^\n]+)/i.exec(text) || /REQUIRED:\s*([^\n]+)/i.exec(text);
  return m ? m[1].trim() : null;
}

function statusOf(fname, text) {
  if (/_(SUPERSEDED|SUPERSEDED-WITH-RESIDUAL)\.txt$/i.test(fname) || /\bSUPERSEDED\b/.test(text.slice(0, 300))) return "superseded";
  if (/_(DUP|DUPLICATE)\.txt$/i.test(fname)) return "duplicate";
  if (/_(STALE|LIKELY-STALE)\.txt$/i.test(fname)) return "NEEDS-VERIFY";
  if (/_(VERIFY)\.txt$/i.test(fname)) return "NEEDS-VERIFY";
  if (/_DONE\.txt$/i.test(fname)) return "done";
  if (/\[NOT-BUILT\]/.test(text)) return "PENDING";
  if (/\[PARTIAL\]/.test(text)) return "PARTIAL";
  if (/\[(DONE|BUILT)\]/.test(text)) return "done";
  return "NEEDS-VERIFY";
}

function main() {
  const master6 = process.argv[2];
  const phaseDir = process.argv[3];
  const write = process.argv.includes("--write");
  if (!master6 || !phaseDir) {
    console.error("usage: register-authored-blocks.mjs <MASTER-6 path> <phaseFolder> [--write]");
    process.exit(2);
  }
  const phaseKey = PHASE_BY_DIR[phaseDir];
  const dir = path.join(master6, phaseDir);
  const reg = registeredNormSet();
  const tally = { registered: 0, already_registered: 0, superseded: 0, duplicate: 0, needs_verify: 0, pending: 0, partial: 0, done: 0, skipped_no_acceptance: 0 };
  const skips = [];

  for (const fname of fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).sort()) {
    const nid = norm(fname);
    if (reg.has(nid)) { tally.already_registered++; continue; }
    const text = fs.readFileSync(path.join(dir, fname), "utf8");
    const blockId = blockIdFromФile(fname);
    let acceptance = extractAcceptance(text);
    if (acceptance.length === 0) {
      const claim = extractClaim(text);
      if (claim) acceptance = [{ check: `Authored claim (no explicit ACCEPTANCE[] in dispatch): ${claim.slice(0, 380)}` }];
    }
    if (acceptance.length === 0) { tally.skipped_no_acceptance++; skips.push(fname); continue; }
    const status = statusOf(fname, text);
    const entry = {
      block_id: blockId,
      status,
      classification: classify(text),
      phase: phaseKey,
      source: `MASTER-6 authored dispatch (${phaseDir})`,
      source_file: fname,
      allowed_files: [extractLane(text) || `authored dispatch — LANE LOCK not explicit; scope per ${phaseDir}`],
      acceptance,
      note: "Registered by faithful extraction from the authored MASTER-6 dispatch spec (real acceptance/lane/status). Status reflects the dispatch's own marker; NEEDS-VERIFY = still needs a live code check.",
    };
    const outName = blockId.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 120) + ".json";
    if (write) fs.writeFileSync(path.join(BLOCK_READY, outName), JSON.stringify(entry, null, 2) + "\n");
    tally.registered++;
    tally[status === "done" ? "done" : status === "superseded" ? "superseded" : status === "duplicate" ? "duplicate" : status === "NEEDS-VERIFY" ? "needs_verify" : status === "PARTIAL" ? "partial" : "pending"]++;
  }

  console.log(`[register-authored-blocks] phase=${phaseKey} ${write ? "WROTE" : "DRY-RUN"} —`, JSON.stringify(tally));
  if (skips.length) console.log("  SKIPPED (no extractable acceptance — not registered hollow):\n   -", skips.join("\n   - "));
}

main();
