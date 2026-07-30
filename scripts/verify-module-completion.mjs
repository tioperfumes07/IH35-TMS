#!/usr/bin/env node
/**
 * GUARD: module completion is N of M checklist items — not PR volume.
 *
 * docs/module-completion/<module>.json is the machine source of truth.
 * - complete:true is ILLEGAL while any item is not PASS or qualifying HOLD
 * - Branch commits claiming "accounting done" / "banking done" / "module complete"
 *   while that module's complete!==true → FAIL
 * - Prints PROGRESS: N of M for each module
 *
 * Qualifying HOLD: status===HOLD && owner_hold===true && tracker && future_block
 *
 * ZERO-COMMIT FAKE-GREEN (fixed 2026-07-25, same family as verify-step 1430): the false-complete-claim
 * arm reads branch commits, and `listBranchCommits` used to `return []` when `git merge-base` found
 * nothing — so in a shallow clone a commit claiming "accounting done" was never read and the arm
 * passed vacuously. Range resolution is now shared with 1430/1324 via
 * scripts/lib/branch-range-guard.mjs, which refuses to call an unusable range a pass.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyCommitRange, collectGitFacts, rangeCommitShas } from "./lib/branch-range-guard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "docs/module-completion");
const LABEL = "verify-module-completion";
const SELFTEST = process.argv.includes("--selftest");
const WRITE_MD = process.argv.includes("--write-md");

const REQUIRED_ITEM_KEYS = ["id", "title", "layers", "spec", "status", "evidence"];
const STATUSES = new Set(["PASS", "HOLD", "OPEN", "FAIL", "UNVERIFIED"]);

const sh = (cmd) => {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

export function loadManifests(dir = DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const rel = path.join("docs/module-completion", f);
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      return { file: rel, data };
    });
}

export function qualifiesHold(item) {
  return (
    item.status === "HOLD" &&
    item.owner_hold === true &&
    typeof item.tracker === "string" &&
    item.tracker.length > 0 &&
    typeof item.future_block === "string" &&
    item.future_block.length > 0
  );
}

export function scoreManifest(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  const M = items.length;
  let N = 0;
  for (const it of items) {
    if (it.status === "PASS" || qualifiesHold(it)) N += 1;
  }
  const open = items.filter((it) => !["PASS"].includes(it.status) && !qualifiesHold(it));
  return { N, M, open, progress: `${N} of ${M}` };
}

export function assertManifestShape(file, data) {
  const problems = [];
  if (!data.module || typeof data.module !== "string") problems.push(`${file}: missing module`);
  if (typeof data.complete !== "boolean") problems.push(`${file}: complete must be boolean`);
  if (!Array.isArray(data.items) || data.items.length === 0) problems.push(`${file}: items[] required`);
  const ids = new Set();
  for (const it of data.items || []) {
    for (const k of REQUIRED_ITEM_KEYS) {
      if (it[k] === undefined || it[k] === null || it[k] === "") {
        problems.push(`${file}: item ${it.id || "?"} missing ${k}`);
      }
    }
    if (it.status && !STATUSES.has(it.status)) {
      problems.push(`${file}: item ${it.id} invalid status ${it.status}`);
    }
    if (it.id) {
      if (ids.has(it.id)) problems.push(`${file}: duplicate id ${it.id}`);
      ids.add(it.id);
    }
    if (it.status === "HOLD" && !qualifiesHold(it)) {
      problems.push(
        `${file}: item ${it.id} status HOLD but missing owner_hold+tracker+future_block (non-qualifying HOLD)`
      );
    }
  }
  const { N, M, open } = scoreManifest(data);
  if (data.complete === true && open.length) {
    problems.push(
      `${file}: complete:true ILLEGAL — still open: ${open.map((i) => i.id).join(", ")} (${N} of ${M})`
    );
  }
  if (data.complete === true && N !== M) {
    problems.push(`${file}: complete:true but N!==M (${N} of ${M})`);
  }
  if (data.complete === false && N === M && M > 0) {
    problems.push(
      `${file}: all items PASS/HOLD but complete:false — set complete:true or fix item statuses`
    );
  }
  return problems;
}

/**
 * Renders the ranked FAIL registry (PERMANENT-FIX §1 / Rule 21) into the manifest markdown when a
 * module's JSON carries `ranked_fail_registry.rows`. Deriving the per-row Status from the live
 * `items[]` (instead of a hand-typed field) means a FAIL cannot be silently flipped to PASS by
 * editing prose — it can only change by actually changing the bound item's own status.
 */
export function renderRankedFailRegistry(data) {
  const registry = data.ranked_fail_registry;
  const rows = Array.isArray(registry?.rows) ? registry.rows : [];
  if (!rows.length) return [];
  const byId = new Map((data.items || []).map((it) => [it.id, it]));
  const lines = [
    "",
    `## RANKED ${data.module.toUpperCase()} FAIL LIST (published M — every future ${data.module} PR cites a row here)`,
    "",
  ];
  if (registry.source) lines.push(`_${registry.source}_`, "");
  lines.push(
    "| Rank | ID | P | Title | Canonical target | Bound item(s) (live status) | Fix block |",
    "|---|---|---|---|---|---|---|"
  );
  for (const row of rows) {
    const boundStatus = (row.bound_items || [])
      .map((id) => `\`${id}\`:${byId.get(id)?.status || "MISSING"}`)
      .join(" · ");
    lines.push(
      `| ${row.rank ?? "—"} | \`${row.id}\` | ${row.priority} | ${String(row.title || "").replace(/\|/g, "/")} | ${String(row.canonical_target || "").replace(/\|/g, "/")} | ${boundStatus} | ${String(row.fix_block || "").replace(/\|/g, "/")} |`
    );
  }
  return lines;
}

export function renderMarkdown(data, score) {
  const lines = [
    `# Module completion — ${data.title || data.module}`,
    "",
    `**PROGRESS: ${score.progress}** · complete: \`${data.complete}\` · as_of: ${data.as_of || "—"} · live_sha: \`${data.live_sha || "—"}\``,
    "",
    `| Status | Count |`,
    `|---|---:|`,
  ];
  const counts = { PASS: 0, HOLD: 0, OPEN: 0, FAIL: 0, UNVERIFIED: 0 };
  for (const it of data.items) counts[it.status] = (counts[it.status] || 0) + 1;
  for (const [k, v] of Object.entries(counts)) lines.push(`| ${k} | ${v} |`);
  lines.push(...renderRankedFailRegistry(data));
  lines.push("", "| ID | Status | Title | Evidence | PR |", "|---|---|---|---|---|");
  for (const it of data.items) {
    lines.push(
      `| \`${it.id}\` | **${it.status}** | ${it.title} | ${String(it.evidence || "").replace(/\|/g, "/")} | ${it.pr || "—"} |`
    );
  }
  lines.push("", `Desktop audit: ${data.desktop_audit || "—"}`, "");
  return lines.join("\n");
}

export function assertNoFalseCompleteClaims(commits, manifests) {
  const problems = [];
  const byMod = Object.fromEntries(manifests.map((m) => [m.data.module, m]));
  for (const c of commits) {
    const text = `${c.subject}\n${c.body}`;
    for (const mod of Object.keys(byMod)) {
      const re = new RegExp(`\\b${mod}\\s+(is\\s+)?(fully\\s+)?(done|complete|COMPLETED)\\b`, "i");
      if (re.test(text) && byMod[mod].data.complete !== true) {
        const sc = scoreManifest(byMod[mod].data);
        problems.push(
          `${c.sha.slice(0, 9)} claims ${mod} done/complete but manifest is ${sc.progress} (complete:false)`
        );
      }
    }
    if (/\bmodule\s+(is\s+)?(fully\s+)?(done|complete)\b/i.test(text) && !/UNVERIFIED|PROGRESS:\s*\d+\s+of\s+\d+/i.test(text)) {
      // soft: only when money module named above
    }
  }
  return problems;
}

/** Set by listBranchCommits so a PASS states which range was read, never a bare "PASS". */
let RANGE_NOTE = "";

function listBranchCommits() {
  const facts = collectGitFacts(ROOT);
  const shas = rangeCommitShas(facts, ROOT);
  const verdict = classifyCommitRange({ ...facts, commitCount: shas.length });
  if (verdict.fatal) {
    console.error(`${LABEL}: FAIL [${verdict.code}] — the branch range cannot be checked:\n  ${verdict.fatal}`);
    process.exit(1);
  }
  RANGE_NOTE = `${verdict.note} [${verdict.code}]`;
  return shas.map((sha) => ({
    sha,
    subject: sh(`git log -1 --format=%s ${sha}`),
    body: sh(`git log -1 --format=%b ${sha}`),
  }));
}

export function runAll(opts = {}) {
  const problems = [];
  const manifests = opts.manifests || loadManifests(opts.dir || DIR);
  if (!manifests.length) {
    problems.push("no docs/module-completion/*.json — module N-of-M manifests required");
    return { problems, scores: [] };
  }
  const scores = [];
  for (const { file, data } of manifests) {
    problems.push(...assertManifestShape(file, data));
    const sc = scoreManifest(data);
    scores.push({ module: data.module, ...sc, complete: data.complete });
    if (opts.writeMd) {
      const mdPath = path.join(opts.dir || DIR, `${data.module}.md`);
      fs.writeFileSync(mdPath, renderMarkdown(data, sc));
    } else {
      // The .md scoreboard is DERIVED, in full, from the .json beside it. It used to be committed and
      // CI failed when the two drifted — which meant every branch that touched a manifest conflicted
      // on a generated file, and the "fix" was always the same mechanical regeneration. That is a
      // recurring cost with no informational value, so the .json is now the single committed source
      // of truth and the .md is REGENERATED here on every run instead of being diffed.
      //
      // Ordering note (verified 2026-07-28): four later guards read these files —
      // verify-banking-fail-registry (1467), verify-projection-flags-off-by-design (1468),
      // verify-bank-econ-04-honesty-keep (1485) and verify-bankfeed-je-match (1507). This generator
      // is step 1431, so it always writes them before any consumer runs. A consumer added BELOW 1431
      // would read a stale or absent file — put it after 1431, or regenerate first.
      const mdPath = path.join(ROOT, "docs/module-completion", `${data.module}.md`);
      fs.writeFileSync(mdPath, renderMarkdown(data, sc));
    }
  }
  if (!opts.skipCommits) {
    problems.push(...assertNoFalseCompleteClaims(listBranchCommits(), manifests));
  }
  return { problems, scores };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain && SELFTEST) {
  const failures = [];
  const bad = {
    module: "accounting",
    complete: true,
    items: [
      {
        id: "X1",
        title: "t",
        layers: ["DOD-A"],
        spec: "s",
        status: "OPEN",
        evidence: "e",
      },
    ],
  };
  const p1 = assertManifestShape("test.json", bad);
  if (!p1.some((x) => x.includes("complete:true ILLEGAL"))) failures.push("complete-illegal not caught");

  const good = {
    module: "accounting",
    complete: false,
    items: [
      {
        id: "X1",
        title: "t",
        layers: ["DOD-A"],
        spec: "s",
        status: "PASS",
        evidence: "e",
      },
      {
        id: "X2",
        title: "t2",
        layers: ["DOD-A"],
        spec: "s",
        status: "FAIL",
        evidence: "e",
      },
    ],
  };
  const sc = scoreManifest(good);
  if (sc.progress !== "1 of 2") failures.push(`score ${sc.progress}`);
  const claims = assertNoFalseCompleteClaims(
    [{ sha: "aaaaaaaaa", subject: "docs: accounting is fully done", body: "" }],
    [{ file: "x", data: good }]
  );
  if (!claims.length) failures.push("false complete claim not caught");

  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL`, failures);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: PASS`);
  process.exit(0);
}

if (isMain) {
  const { problems, scores } = runAll({ writeMd: WRITE_MD });
  for (const s of scores) {
    console.log(`${LABEL}: ${s.module} PROGRESS ${s.progress} complete=${s.complete}`);
  }
  if (WRITE_MD) {
    console.log(`${LABEL}: wrote docs/module-completion/*.md`);
    // Same thrash class as the .md files: JSON edit without regenerating the in-app TS fails CI.
    // --write-md is the agent/human "I touched manifests" path — keep the generated UI data in lockstep.
    try {
      execSync(`${process.execPath} scripts/generate-module-completion-data.mjs`, {
        cwd: ROOT,
        stdio: "inherit",
      });
    } catch {
      console.error(`${LABEL}: FAIL — could not regenerate module-completion.ts after --write-md`);
      process.exit(1);
    }
    process.exit(0);
  }
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — ${RANGE_NOTE || "manifest-only (branch commits skipped)"}`);
}