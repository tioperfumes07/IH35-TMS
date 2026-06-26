#!/usr/bin/env node
// needs-verify-sweep.mjs — per-block EVIDENCE sweep of the NEEDS-VERIFY set (READ-ONLY).
//
//   node scripts/needs-verify-sweep.mjs
//
// For every NEEDS-VERIFY block in docs/trackers/block-reconciliation-data.json, hunt HARD evidence on
// origin/main and propose an HONEST status. Evidence, strongest first:
//   1. merged PR on the block's named branch (accounting Status-line `feat/...`, or .block-ready .branch)
//   2. ALL signature artifacts the block's own doc names are present on origin/main
//      (db/migrations/*.sql, apps/**/*.ts(x) services/routes, scripts/verify-*.mjs)
//   3. partial artifacts present, or only a PR-title token match  -> stays NEEDS-VERIFY (genuinely weak)
//   4. no artifacts + no PR -> PENDING (forward spec; PENDING (GATED) if financial)
//
// Output: docs/specs/NEEDS-VERIFY-SWEEP-RESULT.md  (block -> evidence path -> proposed status)
// Writes NOTHING else. Does not mutate the tracker. GUARD spot-checks the proposed DONEs after.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainFiles = new Set(
  execFileSync("git", ["ls-tree", "-r", "origin/main", "--name-only"], { cwd: ROOT, encoding: "utf8" })
    .split(/\r?\n/).filter(Boolean)
);

let merged = [];
try {
  merged = JSON.parse(execFileSync("gh", ["pr", "list", "--state", "merged", "--limit", "3000", "--json", "number,title,headRefName,mergedAt"],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
} catch { console.warn("[sweep] gh unavailable — branch/title PR signals skipped"); }
const prByBranch = new Map(merged.filter((p) => p.headRefName).map((p) => [p.headRefName, p]));
function prByToken(id) {
  const tok = (id.match(/^([A-Za-z]+-?\d*[A-Za-z]?)/) || [, id])[1];
  if (!tok || tok.length < 3) return null;
  const re = new RegExp(`\\b${tok.replace(/-/g, "[- ]?")}\\b`, "i");
  return merged.find((p) => re.test(p.title || "")) || null;
}

// find a block's source doc on disk
function findDoc(b) {
  const tries = [];
  if (b.source === "accounting") tries.push(`docs/accounting/${b.id}.md`);
  if (b.source === "gap-spec") tries.push(`docs/specs/${b.id}.md`);
  if (b.source === "enterprise-29") tries.push(`docs/dispatch/${b.id}.txt`);
  if (b.source === ".block-ready") tries.push(`.block-ready/${b.id}.json`);
  for (const t of tries) if (fs.existsSync(path.join(ROOT, t))) return t;
  // program: recursive search under docs/blocks
  if (b.source === "program") {
    const stack = ["docs/blocks"];
    while (stack.length) {
      const d = stack.pop();
      for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
        const rel = path.join(d, e.name);
        if (e.isDirectory()) stack.push(rel);
        else if (e.name === `${b.id}.txt`) return rel;
      }
    }
  }
  // gap-spec/enterprise prefix fallback
  for (const dir of ["docs/specs", "docs/dispatch"]) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) continue;
    const hit = fs.readdirSync(full).find((f) => f.startsWith(b.id) && /\.(md|txt)$/.test(f));
    if (hit) return path.join(dir, hit);
  }
  return null;
}

const isSig = (f) =>
  (f.startsWith("db/migrations/") && f.endsWith(".sql")) ||
  /^scripts\/verify-.*\.(mjs|ts|cjs)$/.test(f) ||
  (f.startsWith("apps/") && /\.(ts|tsx)$/.test(f) && !f.includes(".test."));

// extract candidate signature artifacts named inside a doc body
function namedArtifacts(docRel) {
  if (!docRel) return [];
  const body = fs.readFileSync(path.join(ROOT, docRel), "utf8");
  const out = new Set();
  // explicit paths
  for (const m of body.matchAll(/\b(apps\/[A-Za-z0-9_./-]+\.(?:ts|tsx))\b/g)) if (!m[1].includes(".test.")) out.add(m[1]);
  for (const m of body.matchAll(/\b(scripts\/verify-[A-Za-z0-9_-]+\.(?:mjs|ts|cjs))\b/g)) out.add(m[1]);
  for (const m of body.matchAll(/\b(db\/migrations\/[A-Za-z0-9_]+\.sql)\b/g)) out.add(m[1]);
  // bare migration filename (accounting "Migration: `NNNN_x.sql`")
  for (const m of body.matchAll(/\b((?:\d{4}|\d{12})_[a-z0-9_]+\.sql)\b/g)) out.add(`db/migrations/${m[1]}`);
  return [...out];
}
// accounting Status-line branch
function namedBranch(docRel) {
  if (!docRel) return null;
  const body = fs.readFileSync(path.join(ROOT, docRel), "utf8");
  const m = body.match(/`(feat\/[A-Za-z0-9._-]+|fix\/[A-Za-z0-9._-]+|chore\/[A-Za-z0-9._-]+)`/);
  return m ? m[1] : null;
}

const d = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/trackers/block-reconciliation-data.json"), "utf8"));
const nv = d.blocks.filter((b) => b.status === "NEEDS-VERIFY");

const rows = [];
for (const b of nv) {
  const docRel = findDoc(b);
  const branch = namedBranch(docRel);
  const brPr = branch ? prByBranch.get(branch) : null;
  const arts = namedArtifacts(docRel).filter(isSig);
  const present = arts.filter((a) => mainFiles.has(a));
  const tokPr = prByToken(b.id);

  let proposed, evidence;
  if (brPr) { proposed = "DONE"; evidence = `branch ${branch} → PR #${brPr.number} merged ${(brPr.mergedAt || "").slice(0, 10)}`; }
  else if (arts.length && present.length === arts.length) { proposed = "DONE"; evidence = `all ${arts.length} named artifact(s) on main: ${present.slice(0, 3).join(", ")}${present.length > 3 ? " …" : ""}`; }
  else if (present.length) { proposed = "NEEDS-VERIFY"; evidence = `PARTIAL ${present.length}/${arts.length} artifact(s) on main: ${present.slice(0, 2).join(", ")}`; }
  else if (tokPr) { proposed = "NEEDS-VERIFY"; evidence = `PR #${tokPr.number} title-match only ("${(tokPr.title || "").slice(0, 50)}"), no artifact`; }
  else { proposed = b.fin ? "PENDING (GATED)" : "PENDING"; evidence = docRel ? `forward spec, 0 named artifacts on main (${docRel})` : `no doc found, no PR`; }

  rows.push({ id: b.id, source: b.source, fin: b.fin, was: b.status, proposed, evidence, doc: docRel || "" });
}

const tally = {};
for (const r of rows) tally[r.proposed] = (tally[r.proposed] || 0) + 1;
console.log(`[sweep] ${rows.length} NEEDS-VERIFY swept → ` + Object.entries(tally).map(([k, v]) => `${k}=${v}`).join("  "));

const order = { "DONE": 0, "NEEDS-VERIFY": 1, "PENDING": 2, "PENDING (GATED)": 3 };
rows.sort((a, b) => (order[a.proposed] - order[b.proposed]) || a.source.localeCompare(b.source) || a.id.localeCompare(b.id));

const tbl = rows.map((r) => `| ${r.id} | ${r.source} | ${r.fin ? "💰" : ""} | ${r.proposed} | ${r.evidence.replace(/\|/g, "/")} |`).join("\n");
const out = `# NEEDS-VERIFY SWEEP — per-block evidence (proposed reclassification)

Read-only evidence sweep of the **${rows.length} NEEDS-VERIFY** blocks (the set proven frozen since #1446).
For each: hunted its OWN doc's named artifacts + branch on \`origin/main\` (${mainFiles.size} files) and
${merged.length} merged PRs. **DONE** = a named branch merged OR every signature artifact the block names is
present on main. **NEEDS-VERIFY (kept)** = partial artifacts or a title-only PR match (genuinely weak).
**PENDING / (GATED)** = a forward spec that named no built artifacts and has no merged PR (it was never
"maybe built" — it's unbuilt). GUARD spot-checks the proposed DONEs before the tracker is trusted.

## Proposed outcome
${Object.entries(tally).map(([k, v]) => `- **${k}**: ${v}`).join("\n")}

## Every swept block (was NEEDS-VERIFY → proposed)
| Block | Source | Fin | Proposed | Evidence |
|-------|--------|-----|----------|----------|
${tbl}
`;
fs.writeFileSync(path.join(ROOT, "docs/specs/NEEDS-VERIFY-SWEEP-RESULT.md"), out);
console.log("[sweep] wrote docs/specs/NEEDS-VERIFY-SWEEP-RESULT.md");
