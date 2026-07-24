#!/usr/bin/env node
/**
 * GUARD: "N of M PRs" per module is DATA, not prose — and "merged" never counts as done.
 *
 * Owner rule (2026-07-24): for every module the owner must be able to see `N of M` plus a checklist
 * of every boundary and whether it was built to spec. Hand-written completion reports drift the
 * moment a PR merges (the safety + lists audit files both still said "0 of 30" / "0 of 14" while
 * 19 and 8 PRs respectively had already merged), and PR titles cannot be scraped reliably
 * (`SAF-F19/F15` shorthand defeats the obvious regex).
 *
 * So the manifests under docs/trackers/module-completion/*.json are the single source of truth and
 * this guard enforces:
 *   1. SHAPE — every boundary has id / title / status; every status is a declared one.
 *   2. EVIDENCE — `status: "verified"` REQUIRES a non-empty evidence string. This is the whole
 *      point: it makes "merged" structurally incapable of counting as done. N counts only `verified`.
 *   3. NO SILENT COMPLETE — a module may claim `complete: true` only when N === M.
 *   4. NO DRIFT — the human-readable docs/trackers/MODULE-COMPLETION-STATUS.md is GENERATED from
 *      the manifests; if it is stale the guard fails and tells you to re-run with --write.
 *
 * Usage: node scripts/verify-module-completion.mjs [--write] [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "docs/trackers/module-completion");
const STATUS_DOC = path.join(ROOT, "docs/trackers/MODULE-COMPLETION-STATUS.md");
const LABEL = "verify-module-completion";

const VALID = new Set([
  "not_started",
  "pr_open",
  "partially_merged_unverified",
  "merged_unverified",
  "verified",
  "unmapped",
]);

/** N counts ONLY fully-verified boundaries. Merged is not done. */
export const countsTowardN = (status) => status === "verified";

export function validateManifest(m) {
  const problems = [];
  const where = m?.module ? `module "${m.module}"` : "a manifest with no module name";
  if (!m || typeof m.module !== "string" || !m.module) problems.push(`${where}: missing "module"`);
  if (typeof m?.M !== "number" || m.M < 0) problems.push(`${where}: missing numeric "M"`);
  if (!Array.isArray(m?.boundaries)) {
    problems.push(`${where}: missing "boundaries" array`);
    return problems;
  }
  if (m.boundaries.length !== m.M) {
    problems.push(
      `${where}: declares M=${m.M} but lists ${m.boundaries.length} boundaries — M must equal the ` +
        `number of boundary rows, or the "N of M" the owner reads is a lie.`
    );
  }
  const seen = new Set();
  for (const b of m.boundaries) {
    const id = b?.id ?? "(no id)";
    if (!b?.id) problems.push(`${where}: a boundary has no id`);
    else if (seen.has(b.id)) problems.push(`${where}: duplicate boundary id ${b.id}`);
    seen.add(b?.id);
    if (!b?.title) problems.push(`${where} ${id}: missing title`);
    if (!VALID.has(b?.status)) {
      problems.push(`${where} ${id}: status "${b?.status}" is not one of ${[...VALID].join(", ")}`);
    }
    // THE LOAD-BEARING ASSERTION.
    if (b?.status === "verified" && !String(b?.evidence ?? "").trim()) {
      problems.push(
        `${where} ${id}: status "verified" with an EMPTY evidence field. Live proof — endpoint, ` +
          `health sha, Neon row count, screenshot path — or it is not verified. See ` +
          `docs/specs/PER-PR-CHECKLIST.md §3.`
      );
    }
  }
  const n = m.boundaries.filter((b) => countsTowardN(b?.status)).length;
  if (m.complete === true && n !== m.M) {
    problems.push(
      `${where}: claims complete:true but only ${n} of ${m.M} boundaries are "verified". ` +
        `A module is COMPLETE only when every boundary carries live proof.`
    );
  }
  return problems;
}

export function summarise(m) {
  const by = (s) => m.boundaries.filter((b) => b.status === s).length;
  return {
    module: m.module,
    M: m.M,
    N: m.boundaries.filter((b) => countsTowardN(b.status)).length,
    verified: by("verified"),
    merged_unverified: by("merged_unverified") + by("partially_merged_unverified"),
    not_started: by("not_started") + by("pr_open"),
    unmapped: by("unmapped"),
    holds: m.boundaries.filter((b) => b.hold === true).length,
  };
}

function renderStatusDoc(manifests) {
  const lines = [];
  lines.push("# Module completion — N of M (GENERATED — do not hand-edit)");
  lines.push("");
  lines.push("Generated from `docs/trackers/module-completion/*.json` by");
  lines.push("`scripts/verify-module-completion.mjs --write`. The manifests are the source of truth;");
  lines.push("this file is regenerated and CI fails if it drifts (verify-step 1423).");
  lines.push("");
  lines.push("**N counts ONLY boundaries with `status: \"verified\"` — a recorded live proof.**");
  lines.push("`merged_unverified` means the code shipped but nobody proved it works: it does NOT count.");
  lines.push("");
  lines.push("| Module | N of M verified | merged, unverified | not started | unmapped | HOLD (owner-gated) |");
  lines.push("|---|---|---|---|---|---|");
  for (const m of manifests) {
    const s = summarise(m);
    lines.push(
      `| **${s.module}** | **${s.N} of ${s.M}** | ${s.merged_unverified} | ${s.not_started} | ${s.unmapped} | ${s.holds} |`
    );
  }
  lines.push("");
  for (const m of manifests) {
    const s = summarise(m);
    lines.push(`## ${m.module} — ${s.N} of ${s.M} verified`);
    lines.push("");
    if (m.audit_file) lines.push(`Audit: \`${m.audit_file}\``);
    if (m.settlement_file) lines.push(`Prod settlement: \`${m.settlement_file}\``);
    lines.push("");
    lines.push("| # | Boundary | Findings | HOLD | PRs | Status | Evidence / note |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const b of m.boundaries) {
      const mark = b.status === "verified" ? "x" : " ";
      lines.push(
        `| [${mark}] ${b.id} | ${b.title} | ${(b.findings ?? []).join(", ") || "—"} | ` +
          `${b.hold === true ? "**YES**" : b.hold === null ? "?" : "no"} | ` +
          `${(b.prs ?? []).map((p) => `#${p}`).join(", ") || "—"} | \`${b.status}\` | ` +
          `${String(b.evidence ?? "").replace(/\|/g, "\\|") || "—"} |`
      );
    }
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

function loadManifests() {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const failures = [];
  const base = () => ({
    module: "t",
    M: 1,
    boundaries: [{ id: "T-B01", title: "x", status: "merged_unverified", evidence: "" }],
  });
  const expect = (name, mutate, needle) => {
    const m = base();
    mutate(m);
    const problems = validateManifest(m);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };

  // 1. THE point of the guard: "verified" without evidence must fail.
  expect("verified-without-evidence", (m) => { m.boundaries[0].status = "verified"; }, "EMPTY evidence field");
  // 2. Whitespace-only evidence is still empty.
  expect("whitespace-evidence", (m) => { m.boundaries[0].status = "verified"; m.boundaries[0].evidence = "   "; }, "EMPTY evidence field");
  // 3. M must match the boundary count or "N of M" misleads.
  expect("M-mismatch", (m) => { m.M = 5; }, "must equal the number of boundary rows");
  // 4. complete:true while unverified must fail.
  expect("false-complete", (m) => { m.complete = true; }, "claims complete:true");
  // 5. Unknown status must fail.
  expect("bad-status", (m) => { m.boundaries[0].status = "done"; }, "is not one of");
  // 6. Duplicate ids must fail.
  expect("dup-id", (m) => { m.M = 2; m.boundaries.push({ ...m.boundaries[0] }); }, "duplicate boundary id");

  // Negative: a properly-evidenced verified boundary must NOT be flagged.
  const ok = validateManifest({
    module: "t", M: 1,
    boundaries: [{ id: "T-B01", title: "x", status: "verified", evidence: "healthz sha 2088757; Neon rows=63" }],
  });
  if (ok.length) failures.push(`false positive on an evidenced boundary: ${ok.join(" | ")}`);
  // Negative: merged_unverified with no evidence is legal (it is honest, not done).
  const honest = validateManifest(base());
  if (honest.length) failures.push(`false positive on merged_unverified: ${honest.join(" | ")}`);
  // Negative: complete:true when all verified is legal.
  const complete = validateManifest({
    module: "t", M: 1, complete: true,
    boundaries: [{ id: "T-B01", title: "x", status: "verified", evidence: "row count 12" }],
  });
  if (complete.length) failures.push(`false positive on a legitimately complete module: ${complete.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 6 planted defects caught; evidenced/honest/complete manifests not flagged`);
  process.exit(0);
}

if (IS_MAIN) {
  const manifests = loadManifests();
  const problems = manifests.flatMap((m) => validateManifest(m));

  const rendered = renderStatusDoc(manifests);
  if (process.argv.includes("--write")) {
    fs.writeFileSync(STATUS_DOC, rendered);
    console.log(`${LABEL}: wrote ${path.relative(ROOT, STATUS_DOC)}`);
  } else {
    const current = fs.existsSync(STATUS_DOC) ? fs.readFileSync(STATUS_DOC, "utf8") : "";
    if (current !== rendered) {
      problems.push(
        `docs/trackers/MODULE-COMPLETION-STATUS.md is STALE vs the manifests. ` +
          `Re-run: node scripts/verify-module-completion.mjs --write`
      );
    }
  }

  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  for (const m of manifests) {
    const s = summarise(m);
    console.log(
      `${LABEL}: ${s.module} — ${s.N} of ${s.M} VERIFIED ` +
        `(${s.merged_unverified} merged-but-unverified, ${s.not_started} not started, ${s.unmapped} unmapped, ${s.holds} owner-gated)`
    );
  }
  console.log(`${LABEL} OK — manifests valid, status doc in sync`);
}
