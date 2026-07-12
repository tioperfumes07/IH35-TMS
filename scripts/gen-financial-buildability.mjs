#!/usr/bin/env node
/**
 * Financial buildable-vs-design split (GUARD 2026-07-12). Classifies every FINANCIAL, NOT-done block
 * (status PENDING or PENDING (GATED); NEEDS-VERIFY handled separately) into exactly one bucket, from the
 * .block-ready SOURCE spec (allowed_files + acceptance) — NOT the reconcile rollup (which lacks them).
 *
 *   BUILDABLE-NOW-AND-HOLD = concrete allowed_files (named code targets) AND a functional/field-level
 *                            acceptance → coder CAN build now + open a [HOLD-FOR-JORGE] PR (label = merge only).
 *   NEEDS-JORGE-DECISION   = design-kind acceptance / spec:NONE / empty allowed_files / "0 named artifacts"
 *                            → not buildable until the owner makes a design decision (decision listed).
 *   UNCLEAR                = spec ambiguous (files xor acceptance) — do not force a bucket.
 *
 * Output: docs/trackers/financial-block-buildability.{md,csv} + printed counts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECON = path.join(ROOT, "docs/trackers/block-reconciliation-data.json");
const BR_DIR = path.join(ROOT, ".block-ready");

const recon = JSON.parse(fs.readFileSync(RECON, "utf8"));
const blocks = (recon.blocks ?? []).filter((b) => b.fin && /^PENDING/i.test(String(b.status)));

// Index .block-ready by id (and normalized id) so a recon block can find its source spec.
const norm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
const brById = new Map();
for (const f of fs.readdirSync(BR_DIR).filter((x) => x.endsWith(".json"))) {
  let j; try { j = JSON.parse(fs.readFileSync(path.join(BR_DIR, f), "utf8")); } catch { continue; }
  const id = j.block_id || f.replace(/\.json$/, "");
  brById.set(id, j); brById.set(norm(id), j);
}

const CODE_PATH = /^(apps\/|db\/migrations\/|scripts\/)/;
const DESIGN_WORD = /design|decision|tbd|to be decided|await|proposal|which |option [ab]|owner (picks|decides|choice)/i;
const FIELD_WORD = /column|endpoint|route|GET |POST |PATCH |field|table|migration|function|component|api|guard|\$\d|cents|status|enum/i;

function classify(j) {
  if (!j) return { bucket: "NEEDS-JORGE-DECISION", has_files: false, acc_kind: "no-spec", decision: "no .block-ready spec on disk — owner must author scope/decision" };
  const af = Array.isArray(j.allowed_files) ? j.allowed_files : [];
  const codeFiles = af.filter((x) => CODE_PATH.test(x));
  const has_files = codeFiles.length > 0;
  const accRaw = Array.isArray(j.acceptance) ? j.acceptance.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ") : String(j.acceptance ?? "");
  const accText = `${accRaw} ${String(j.task ?? "")} ${String(j.summary ?? "")}`.trim();
  const kindField = String(j.acceptance_kind ?? j.kind ?? "");
  let acc_kind;
  if (/design/i.test(kindField)) acc_kind = "design";
  else if (!accRaw.trim() || /spec:\s*none/i.test(accText)) acc_kind = "none";
  else if (FIELD_WORD.test(accRaw)) acc_kind = "functional";
  else if (DESIGN_WORD.test(accRaw)) acc_kind = "design";
  else acc_kind = "prose";

  if (has_files && acc_kind === "functional") return { bucket: "BUILDABLE-NOW-AND-HOLD", has_files, acc_kind, decision: "" };
  if (!has_files || acc_kind === "design" || acc_kind === "none") {
    // Distinguish the DECISION each needs: a clear functional goal that merely lacks named target files is a
    // light "name the targets" scoping decision (then it's buildable); a design-kind/empty spec needs a real
    // design decision. (allowed_files here is a policy-guardrail note on financial blocks, not code paths.)
    const decision = acc_kind === "design"
      ? `design decision required: ${accText.slice(0, 90)}`
      : acc_kind === "functional" && !has_files
        ? `goal defined but no named target files — owner/design names allowed_files, then buildable: ${accText.slice(0, 70)}`
        : !has_files
          ? "no named code targets AND no functional acceptance — owner must decide scope/approach"
          : "acceptance is empty/spec:NONE — owner must specify the functional contract";
    return { bucket: "NEEDS-JORGE-DECISION", has_files, acc_kind, decision };
  }
  return { bucket: "UNCLEAR", has_files, acc_kind, decision: "files present but acceptance is prose-only — clarify the functional contract" };
}

const rows = [];
for (const b of blocks) {
  const j = brById.get(b.id) ?? brById.get(norm(b.id)) ?? null;
  const c = classify(j);
  const lane = (j?.module || j?.lane || j?.phase || (j && Array.isArray(j.allowed_files) ? (j.allowed_files.find((x) => CODE_PATH.test(x)) || "").split("/").slice(0, 3).join("/") : "") || "—");
  const summary = String(j?.task ?? j?.name ?? b.name ?? "").replace(/\s+/g, " ").slice(0, 100);
  rows.push({ id: b.id, lane: String(lane).slice(0, 40), bucket: c.bucket, has_allowed_files: c.has_files ? "yes" : "no", acceptance_kind: c.acc_kind, summary, decision: c.decision });
}

const counts = rows.reduce((a, r) => ((a[r.bucket] = (a[r.bucket] || 0) + 1), a), {});
rows.sort((a, b) => a.bucket.localeCompare(b.bucket) || a.id.localeCompare(b.id));

// CSV
const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
const csv = ["id,lane,bucket,has_allowed_files,acceptance_kind,summary,decision_needed",
  ...rows.map((r) => [r.id, r.lane, r.bucket, r.has_allowed_files, r.acceptance_kind, r.summary, r.decision].map(esc).join(","))].join("\n") + "\n";
fs.writeFileSync(path.join(ROOT, "docs/trackers/financial-block-buildability.csv"), csv);

// MD
const md = [`# Financial blocks — buildable-vs-design split (${recon.date ?? ""})`,
  ``,
  `Classifies every FINANCIAL, NOT-done block (status PENDING / PENDING (GATED)) from its .block-ready source spec.`,
  ``,
  `## Counts`,
  ...Object.entries(counts).sort().map(([k, v]) => `- **${k}**: ${v}`),
  `- **TOTAL**: ${rows.length}`,
  ``,
  `## BUILDABLE-NOW-AND-HOLD (coder can build now → [HOLD-FOR-JORGE] PR; label needed only to merge)`,
  `| id | lane | acceptance | summary |`,
  `|----|------|-----------|---------|`,
  ...rows.filter((r) => r.bucket === "BUILDABLE-NOW-AND-HOLD").map((r) => `| ${r.id} | ${r.lane} | ${r.acceptance_kind} | ${r.summary.replace(/\|/g, "/")} |`),
  ``,
  `## NEEDS-JORGE-DECISION (not buildable until the owner decides)`,
  `| id | lane | why | decision needed |`,
  `|----|------|-----|-----------------|`,
  ...rows.filter((r) => r.bucket === "NEEDS-JORGE-DECISION").map((r) => `| ${r.id} | ${r.lane} | ${r.acceptance_kind}/${r.has_allowed_files === "yes" ? "has-files" : "no-files"} | ${r.decision.replace(/\|/g, "/")} |`),
  ``,
  `## UNCLEAR (spec ambiguous)`,
  `| id | lane | summary |`,
  `|----|------|---------|`,
  ...rows.filter((r) => r.bucket === "UNCLEAR").map((r) => `| ${r.id} | ${r.lane} | ${r.summary.replace(/\|/g, "/")} |`),
  ``].join("\n");
fs.writeFileSync(path.join(ROOT, "docs/trackers/financial-block-buildability.md"), md);

console.log(`[financial-buildability] ${rows.length} financial not-done blocks classified:`);
for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k}: ${v}`);
console.log(`  → docs/trackers/financial-block-buildability.{md,csv}`);
