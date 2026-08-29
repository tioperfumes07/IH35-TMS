#!/usr/bin/env node
/**
 * GUARD: module completion is N of M checklist items — not PR volume.
 *
 * docs/module-completion/<module>.json is the machine source of truth.
 * - complete:true is ILLEGAL while any item is not PASS or qualifying HOLD
 * - complete:true is ILLEGAL while any open|draining wave card in
 *   docs/audit/wave-queue.json lists the module (cross-cutting class still open)
 * - complete:false is REQUIRED (legal) when N===M BUT pinning open wave cards list the module
 *   (status open|draining AND pins_complete !== false). HOLD / empty-expected / N/A-PRE-OP
 *   cards set pins_complete:false so they cannot freeze complete:false on an all-PASS list.
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
import { openWaveIdsForModule } from "./lib/open-wave-modules.mjs";
import {
  assertLiveVerifiedStamps,
  collectLiveVerifiedStamps,
  fetchHealthzVersionSync,
} from "./lib/live-verified-stamps.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "docs/module-completion");
const LABEL = "verify-module-completion";
const SELFTEST = process.argv.includes("--selftest");
const WRITE_MD = process.argv.includes("--write-md");

const REQUIRED_ITEM_KEYS = ["id", "title", "layers", "spec", "status", "evidence"];
const STATUSES = new Set(["PASS", "HOLD", "OPEN", "FAIL", "UNVERIFIED"]);
const HONESTY_RATCHET_IDS = new Set([
  "DISP-S19", "DISP-S26", "DISP-S34", "DISP-S35", "DISP-S36",
  "ACCT-SURF-02", "ACCT-SURF-04", "ACCT-R-04",
]);

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
    .filter(
      (f) =>
        f.endsWith(".json") &&
        // Not a module manifest (binding-guard baseline — 2026-08-29).
        f !== "PROD-VERIFIED-BINDING-BASELINE.json" &&
        f !== "PROD-VERIFIED-HTTP-RECHECK.json" &&
        f !== "PROD-VERIFIED-EVIDENCE-CLASS.json"
    )
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

/** Urgent-6 launch modules — PASS without prod_verified does not count toward N or complete:true. */
export const URGENT_6_COMPLETION_IDS = new Set([
  "accounting",
  "banking",
  "settlements",
  "factoring",
  "dispatch",
  "vendors",
]);

export function itemCountsTowardN(item, moduleId) {
  if (qualifiesHold(item)) return true;
  if (item.status !== "PASS") return false;
  if (URGENT_6_COMPLETION_IDS.has(moduleId) && item.prod_verified !== true) return false;
  return true;
}

export function scoreManifest(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  const moduleId = typeof data.module === "string" ? data.module : "";
  const M = items.length;
  let N = 0;
  for (const it of items) {
    if (itemCountsTowardN(it, moduleId)) N += 1;
  }
  const open = items.filter((it) => !itemCountsTowardN(it, moduleId));
  return { N, M, open, progress: `${N} of ${M}` };
}

const HTTP_RECHECK_JSON = path.join(DIR, "PROD-VERIFIED-HTTP-RECHECK.json");

const EVIDENCE_NEON =
  /\b(SELECT|FROM\s+\w+\.|bypass_rls|n_live_tup|current_user|SET LOCAL app\.|pg_stat_all_tables)\b/i;
const EVIDENCE_HTTP = /\/api\/v1\/[A-Za-z0-9_./?=&%-]+|https?:\/\/api\.ih35dispatch\.com/i;
const EVIDENCE_BROWSER =
  /https?:\/\/app\.ih35dispatch\.com|live Chrome|CDP\s|Owner session|click(?:ed|ing)?\b|tab bar shows/i;

export function classifyProdVerifiedEvidenceShape(ev) {
  const t = String(ev || "");
  if (EVIDENCE_NEON.test(t)) return "neon";
  if (EVIDENCE_HTTP.test(t)) return "http";
  if (EVIDENCE_BROWSER.test(t)) return "browser";
  return "prose";
}

function itemIsBound(item) {
  const sha = typeof item.live_verified_sha === "string" ? item.live_verified_sha.trim() : "";
  const at = item.live_verified_at == null ? "" : String(item.live_verified_at).trim();
  return Boolean(sha && at);
}

/** Unbound prod_verified + exclusive-bucket prose = unfalsifiable fake-green (owner 2026-08-29). */
export function assertUnboundProseNotProdVerified(manifests) {
  const problems = [];
  for (const { file, data } of manifests) {
    if (!Array.isArray(data.items)) continue;
    for (const it of data.items) {
      if (it.prod_verified !== true) continue;
      if (itemIsBound(it)) continue;
      if (classifyProdVerifiedEvidenceShape(it.evidence) !== "prose") continue;
      problems.push(
        `${file}: item ${it.id} is unbound prod_verified with prose-only evidence — REOPEN (UNVERIFIED + packet) or bind live_verified_sha`
      );
    }
  }
  return problems;
}

/** Item ids whose cited HTTP evidence is live 404 must not stay PASS + prod_verified. */
export function assertHttp404NotProdVerified(manifests, recheckPath = HTTP_RECHECK_JSON) {
  const problems = [];
  if (!fs.existsSync(recheckPath)) return problems;
  let rec;
  try {
    rec = JSON.parse(fs.readFileSync(recheckPath, "utf8"));
  } catch {
    problems.push(`${path.relative(ROOT, recheckPath)} unreadable`);
    return problems;
  }
  const deadIds = new Set();
  for (const row of rec.rows || []) {
    if (row.status !== "NOT_FOUND") continue;
    for (const tagged of row.items || []) {
      const colon = String(tagged).indexOf(":");
      if (colon > 0) deadIds.add(String(tagged).slice(colon + 1));
    }
  }
  if (deadIds.size === 0) return problems;
  for (const { file, data } of manifests) {
    if (!Array.isArray(data.items)) continue;
    for (const it of data.items) {
      if (!deadIds.has(it.id)) continue;
      if (it.prod_verified === true || it.status === "PASS") {
        problems.push(
          `${file}: item ${it.id} cites a live HTTP 404 (PROD-VERIFIED-HTTP-RECHECK) — cannot stay PASS/prod_verified`
        );
      }
    }
  }
  return problems;
}

export function assertManifestShape(file, data, opts = {}) {
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
    if (
      HONESTY_RATCHET_IDS.has(it.id) &&
      it.status === "PASS" &&
      /NOT YET VERIFIED|\bUNVERIFIED\b|status stays OPEN/i.test(String(it.evidence || ""))
    ) {
      problems.push(`${file}: item ${it.id} cannot be PASS while its evidence is explicitly UNVERIFIED/OPEN`);
    }
  }
  const { N, M, open } = scoreManifest(data);
  const openWaves =
    opts.openWaveIds !== undefined
      ? opts.openWaveIds
      : typeof data.module === "string"
        ? openWaveIdsForModule(data.module, opts.waveQueuePath)
        : [];

  if (data.complete === true && open.length) {
    problems.push(
      `${file}: complete:true ILLEGAL — still open: ${open.map((i) => i.id).join(", ")} (${N} of ${M})`
    );
  }
  if (data.complete === true && N !== M) {
    problems.push(`${file}: complete:true but N!==M (${N} of ${M})`);
  }
  if (data.complete === true && openWaves.length) {
    problems.push(
      `${file}: complete:true ILLEGAL — open wave card(s) list this module: ${openWaves.join(", ")} (set complete:false until classes drain)`
    );
  }
  // All items PASS/HOLD: complete:true required UNLESS cross-cutting open waves list the module.
  if (data.complete === false && N === M && M > 0 && openWaves.length === 0) {
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
  problems.push(...assertHttp404NotProdVerified(manifests, opts.httpRecheckPath));
  problems.push(...assertUnboundProseNotProdVerified(manifests));
  if (!opts.skipCommits) {
    problems.push(...assertNoFalseCompleteClaims(listBranchCommits(), manifests));
  }
  if (!opts.skipLiveVerified) {
    try {
      const healthzSha = fetchHealthzVersionSync(undefined, { forceCurl: true });
      problems.push(
        ...assertLiveVerifiedStamps({
          stamps: collectLiveVerifiedStamps(manifests),
          healthzSha,
          gitRoot: ROOT,
        })
      );
    } catch (e) {
      problems.push(String(e.message || e));
    }
  }
  return { problems, scores };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain && SELFTEST) {
  const failures = [];
  const passItem = (id) => ({
    id,
    title: "t",
    layers: ["DOD-A"],
    spec: "s",
    status: "PASS",
    evidence: "e",
    prod_verified: true,
  });
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
  const p1 = assertManifestShape("test.json", bad, { openWaveIds: [] });
  if (!p1.some((x) => x.includes("complete:true ILLEGAL"))) failures.push("complete-illegal not caught");

  const plantedEvidenceContradiction = assertManifestShape("accounting.json", {
    module: "accounting",
    complete: true,
    items: [{ ...passItem("ACCT-SURF-02"), evidence: "Live browser UNVERIFIED" }],
  }, { openWaveIds: [] });
  if (!plantedEvidenceContradiction.some((x) => x.includes("cannot be PASS"))) {
    failures.push("PASS-vs-UNVERIFIED evidence contradiction not caught");
  }

  const good = {
    module: "accounting",
    complete: false,
    items: [
      passItem("X1"),
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

  // Cross-cutting wave reconcile (both directions):
  // A) all-PASS + complete:false + open wave → legal honesty (must NOT fail)
  const allPassFalse = {
    module: "banking",
    complete: false,
    items: [passItem("B1"), passItem("B2")],
  };
  const honestyOk = assertManifestShape("banking.json", allPassFalse, {
    openWaveIds: ["CLS-PLANT-BANK"],
  });
  if (honestyOk.length) {
    failures.push(`all-PASS+open-wave+complete:false should be legal, got: ${honestyOk.join("; ")}`);
  }
  // B) all-PASS + complete:true + open wave → ILLEGAL
  const allPassTrue = { ...allPassFalse, complete: true };
  const falseGreen = assertManifestShape("banking.json", allPassTrue, {
    openWaveIds: ["CLS-PLANT-BANK"],
  });
  if (!falseGreen.some((x) => x.includes("open wave card"))) {
    failures.push("all-PASS+open-wave+complete:true not caught");
  }
  // C) all-PASS + complete:false + NO open wave → still must set complete:true
  const staleIncomplete = assertManifestShape("banking.json", allPassFalse, { openWaveIds: [] });
  if (!staleIncomplete.some((x) => x.includes("set complete:true"))) {
    failures.push("all-PASS+no-wave+complete:false not forced to complete:true");
  }
  // D) all-PASS + complete:true + NO open wave → legal
  const cleanComplete = assertManifestShape("banking.json", allPassTrue, { openWaveIds: [] });
  if (cleanComplete.length) {
    failures.push(`all-PASS+no-wave+complete:true should be clean, got: ${cleanComplete.join("; ")}`);
  }

  const planted404 = path.join(ROOT, "scripts", ".http-404-selftest.json");
  fs.writeFileSync(
    planted404,
    JSON.stringify({
      rows: [{ status: "NOT_FOUND", items: ["fuel:FUEL-S01"] }],
    }),
  );
  const stillGreen = assertHttp404NotProdVerified(
    [{ file: "docs/module-completion/fuel.json", data: { items: [passItem("FUEL-S01")] } }],
    planted404,
  );
  fs.rmSync(planted404, { force: true });
  if (!stillGreen.some((x) => x.includes("FUEL-S01"))) {
    failures.push("HTTP 404 PASS/prod_verified ratchet not caught");
  }

  const proseStillGreen = assertUnboundProseNotProdVerified([
    {
      file: "docs/module-completion/legal.json",
      data: { items: [{ ...passItem("LEGAL-X"), evidence: "Looks wired on main." }] },
    },
  ]);
  if (!proseStillGreen.some((x) => x.includes("LEGAL-X"))) {
    failures.push("unbound prose prod_verified ratchet not caught");
  }

  const u6Theater = assertManifestShape(
    "banking.json",
    {
      module: "banking",
      complete: true,
      items: [
        { ...passItem("BANK-ECON-01"), prod_verified: false },
        passItem("BANK-CLS-SHARED"),
      ],
    },
    { openWaveIds: [] }
  );
  if (!u6Theater.some((x) => x.includes("complete:true ILLEGAL"))) {
    failures.push("Urgent-6 PASS without prod_verified still allowed complete:true");
  }

  const emptyP = assertLiveVerifiedStamps({
    stamps: collectLiveVerifiedStamps([{ file: "x.json", data: { items: [passItem("Z1")] } }]),
    healthzSha: "deadbeef",
    gitRoot: ROOT,
  });
  if (!emptyP.some((x) => x.includes("empty scope"))) failures.push("L6 empty scope not caught");

  const head = sh("git rev-parse HEAD");
  const staleP = assertLiveVerifiedStamps({
    stamps: [
      {
        file: "docs/module-completion/system.json",
        id: "L6-BOOT",
        sha: "0000000000000000000000000000000000000001",
        at: "2026-08-28T00:00:00Z",
      },
    ],
    healthzSha: head,
    gitRoot: ROOT,
  });
  if (!staleP.some((x) => x.includes("not a git commit") || x.includes("not an ancestor"))) {
    failures.push("L6 stale/non-commit stamp not caught");
  }

  const okP = assertLiveVerifiedStamps({
    stamps: [
      {
        file: "docs/module-completion/system.json",
        id: "L6-BOOT",
        sha: head,
        at: "2026-08-28T22:21:00Z",
      },
    ],
    healthzSha: head,
    gitRoot: ROOT,
  });
  if (okP.length) failures.push(`L6 ancestor stamp should pass, got: ${okP.join("; ")}`);

  const realStamps = collectLiveVerifiedStamps(loadManifests());
  if (!realStamps.length) {
    failures.push("L6 selftest: real manifests have zero stamps — empty scope must FAIL not exit 0");
  }

  const stripped = loadManifests().map(({ file, data }) => ({
    file,
    data: {
      ...data,
      items: (data.items || []).map((it) => {
        const copy = { ...it };
        delete copy.live_verified_sha;
        delete copy.live_verified_at;
        return copy;
      }),
    },
  }));
  const strippedP = assertLiveVerifiedStamps({
    stamps: collectLiveVerifiedStamps(stripped),
    healthzSha: head,
    gitRoot: ROOT,
  });
  if (!strippedP.some((x) => x.includes("empty scope"))) {
    failures.push("L6 selftest: stripping stamps did not FAIL");
  }

  const savedCi = process.env.CI;
  const savedEnvSha = process.env.IH35_HEALTHZ_SHA;
  process.env.CI = "true";
  process.env.IH35_HEALTHZ_SHA = "deadbeef";
  let envHole = "";
  try {
    envHole = fetchHealthzVersionSync();
  } catch (e) {
    envHole = String(e.message || e);
  }
  if (savedCi === undefined) delete process.env.CI;
  else process.env.CI = savedCi;
  if (savedEnvSha === undefined) delete process.env.IH35_HEALTHZ_SHA;
  else process.env.IH35_HEALTHZ_SHA = savedEnvSha;
  if (envHole === "deadbeef") {
    failures.push("L6 env hole: CI=true still honored IH35_HEALTHZ_SHA=deadbeef");
  }

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
