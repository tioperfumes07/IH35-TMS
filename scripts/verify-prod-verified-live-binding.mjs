#!/usr/bin/env node
/**
 * GUARD: a `prod_verified: true` claim must be BINDABLE TO DEPLOYED CODE.
 *
 * WHY THIS EXISTS (2026-08-29, measured on origin/main):
 *   285 items carry prod_verified:true. Only 10 carry a live_verified_sha.
 *   275 are unfalsifiable — nothing ties them to any deploy, so no guard can ever
 *   detect that they rotted. SYS-S07 is the proof case: prod_verified:true,
 *   live_verified_sha:null, and its own evidence records a live check taken while
 *   the API served 069d531 — three deploys stale by the time anyone read it.
 *
 * THE LAW THIS ENFORCES (docs/module-completion/SCHEMA.md):
 *   "CERTIFIED = every item prod_verified:true" and L6 stamps must be an ancestor
 *   of GET /api/v1/healthz/shallow `version`. This guard closes the gap between
 *   those two sentences: a prod_verified claim with no SHA can never be checked
 *   against either.
 *
 * RATCHET, NOT A CLIFF. Flipping every legacy claim red on day one would be
 * useless noise, so:
 *   - BASELINE (docs/module-completion/PROD-VERIFIED-BINDING-BASELINE.json) records
 *     the ids that predate this guard. Those are WARNED, never failed.
 *   - Any item that BECOMES prod_verified:true after this guard lands MUST carry
 *     live_verified_sha + live_verified_at, and that SHA must be an ancestor of live.
 *   - The baseline may only ever SHRINK. Growing it fails. Removing an id from it
 *     is how the debt gets paid, and it can never be re-added.
 *
 * Run:  node scripts/verify-prod-verified-live-binding.mjs
 *       node scripts/verify-prod-verified-live-binding.mjs --selftest
 *       node scripts/verify-prod-verified-live-binding.mjs --write-baseline   (once, at adoption)
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  expandSha,
  ancestorCheck,
  fetchHealthzVersionSync,
} from "./lib/live-verified-stamps.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "docs/module-completion");
const BASELINE = path.join(DIR, "PROD-VERIFIED-BINDING-BASELINE.json");
const LABEL = "verify-prod-verified-live-binding";
const SELFTEST = process.argv.includes("--selftest");
const WRITE_BASELINE = process.argv.includes("--write-baseline");

export function loadManifests(dir = DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== path.basename(BASELINE))
    .map((f) => ({
      file: path.join("docs/module-completion", f),
      module: f.replace(/\.json$/, ""),
      data: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")),
    }));
}

/** Every prod_verified:true item, with whether it carries a usable live binding. */
export function collectClaims(manifests) {
  const out = [];
  for (const { file, module, data } of manifests) {
    for (const it of data.items || []) {
      if (it.prod_verified !== true) continue;
      const sha = typeof it.live_verified_sha === "string" ? it.live_verified_sha.trim() : "";
      const at = it.live_verified_at == null ? "" : String(it.live_verified_at).trim();
      out.push({ file, module, id: String(it.id || "?"), sha, at, bound: Boolean(sha && at) });
    }
  }
  return out;
}

/** The baseline as committed on origin/main — the anti-tamper reference. */
export function readCommittedBaseline() {
  try {
    const raw = execSync(`git show origin/main:docs/module-completion/${path.basename(BASELINE)}`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const j = JSON.parse(raw);
    return Array.isArray(j.ids) ? j.ids : null;
  } catch {
    return null; // not yet committed — nothing to compare against
  }
}

export function readBaseline() {
  if (!fs.existsSync(BASELINE)) return { ids: [], frozen: false };
  const j = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  return { ids: Array.isArray(j.ids) ? j.ids : [], frozen: true };
}

/**
 * Pure decision core — unit-testable without git or network.
 * @returns {{problems:string[], warnings:string[], stats:object}}
 */
export function analyse({ claims, baselineIds, previousBaselineIds, healthzSha, ancestorOf }) {
  const problems = [];
  const warnings = [];
  const base = new Set(baselineIds);
  const unbound = claims.filter((c) => !c.bound);
  const bound = claims.filter((c) => c.bound);

  // 1. New unbound claims are illegal. Legacy ones warn.
  for (const c of unbound) {
    if (base.has(c.id)) {
      warnings.push(
        `${c.id} (${c.module}) prod_verified:true with no live_verified_sha — legacy debt, in baseline`
      );
    } else {
      problems.push(
        `${c.id} (${c.file}) is prod_verified:true but carries no live_verified_sha + live_verified_at. ` +
          `A prod_verified claim that is not bound to a deployed SHA can never be re-checked or shown to have rotted. ` +
          `Stamp it against live, or set prod_verified:false.`
      );
    }
  }

  // 2. ANTI-TAMPER: the baseline FILE may only shrink.
  if (Array.isArray(previousBaselineIds)) {
    const prev = new Set(previousBaselineIds);
    const added = baselineIds.filter((id) => !prev.has(id));
    if (added.length) {
      problems.push(
        `BASELINE TAMPERED: ${added.length} id(s) added to the baseline file ` +
          `(${added.slice(0, 5).join(", ")}${added.length > 5 ? ", …" : ""}). ` +
          `The unbound-claim baseline may only ever shrink — an id removed can never be re-added. ` +
          `Stamp the item against live instead of baselining it.`
      );
    }
  }

  // 3. Bound claims must point at code that is actually live.
  //    ancestorOf returns "yes" | "no" | "unknown". "unknown" FAILS CLOSED.
  for (const c of bound) {
    const verdict = ancestorOf(c.sha, healthzSha);
    if (verdict === "no") {
      problems.push(
        `${c.id} (${c.file}) claims prod_verified against ${c.sha.slice(0, 12)}, which is NOT an ancestor of ` +
          `live ${healthzSha}. The claim was made against code that is not deployed.`
      );
    } else if (verdict !== "yes") {
      problems.push(
        `${c.id} (${c.file}) — CANNOT DETERMINE whether ${c.sha.slice(0, 12)} is an ancestor of live ` +
          `${healthzSha}: one of those commits is not resolvable in this clone. Run a full ` +
          `\`git fetch origin\` (CI: fetch-depth 0). Refusing to guess in either direction.`
      );
    }
  }

  return {
    problems,
    warnings,
    stats: {
      claims: claims.length,
      bound: bound.length,
      unbound: unbound.length,
      baseline: base.size,
      debtPaid: Math.max(0, base.size - unbound.filter((c) => base.has(c.id)).length),
    },
  };
}

function selftest() {
  const anc = (a, b) => (a === "ghost" || b === "ghost" ? "unknown" : a === "good" && b === "live" ? "yes" : "no");
  const T = [];
  const t = (name, fn) => {
    try {
      fn();
      T.push([name, true]);
    } catch (e) {
      T.push([name, false, e.message]);
    }
  };
  const eq = (a, b, m) => {
    if (a !== b) throw new Error(`${m}: ${a} !== ${b}`);
  };

  t("new unbound claim FAILS", () => {
    const r = analyse({
      claims: [{ id: "NEW-1", module: "m", file: "f", sha: "", at: "", bound: false }],
      baselineIds: ["OLD-1"],
      healthzSha: "live",
      ancestorOf: anc,
    });
    eq(r.problems.length, 1, "expected 1 problem");
  });
  t("baselined unbound claim WARNS not fails", () => {
    const r = analyse({
      claims: [{ id: "OLD-1", module: "m", file: "f", sha: "", at: "", bound: false }],
      baselineIds: ["OLD-1"],
      healthzSha: "live",
      ancestorOf: anc,
    });
    eq(r.problems.length, 0, "expected 0 problems");
    eq(r.warnings.length, 1, "expected 1 warning");
  });
  t("bound claim on undeployed SHA FAILS", () => {
    const r = analyse({
      claims: [{ id: "B-1", module: "m", file: "f", sha: "bad", at: "t", bound: true }],
      baselineIds: [],
      healthzSha: "live",
      ancestorOf: anc,
    });
    eq(r.problems.length, 1, "expected 1 problem");
  });
  t("bound claim on deployed SHA PASSES", () => {
    const r = analyse({
      claims: [{ id: "B-2", module: "m", file: "f", sha: "good", at: "t", bound: true }],
      baselineIds: [],
      healthzSha: "live",
      ancestorOf: anc,
    });
    eq(r.problems.length, 0, "expected 0 problems");
  });
  t("baseline file tampering (id added) FAILS", () => {
    const r = analyse({
      claims: [],
      baselineIds: ["OLD-1", "SNUCK-IN"],
      previousBaselineIds: ["OLD-1"],
      healthzSha: "live",
      ancestorOf: anc,
    });
    if (!r.problems.some((p) => p.includes("BASELINE TAMPERED"))) throw new Error("no tamper problem raised");
  });
  t("baseline shrinking is ALLOWED", () => {
    const r = analyse({
      claims: [],
      baselineIds: ["OLD-1"],
      previousBaselineIds: ["OLD-1", "OLD-2"],
      healthzSha: "live",
      ancestorOf: anc,
    });
    eq(r.problems.length, 0, "shrinking must not fail");
  });
  t("one new unbound claim reports exactly ONE problem (no double-report)", () => {
    const r = analyse({
      claims: [{ id: "NEW-9", module: "m", file: "f", sha: "", at: "", bound: false }],
      baselineIds: ["OLD-1"],
      previousBaselineIds: ["OLD-1"],
      healthzSha: "live",
      ancestorOf: anc,
    });
    eq(r.problems.length, 1, "expected exactly 1 problem");
  });
  t("unresolvable ref FAILS CLOSED as 'cannot determine', not 'not an ancestor'", () => {
    const r = analyse({
      claims: [{ id: "G-1", module: "m", file: "f", sha: "ghost", at: "t", bound: true }],
      baselineIds: [],
      previousBaselineIds: [],
      healthzSha: "live",
      ancestorOf: anc,
    });
    eq(r.problems.length, 1, "expected 1 problem");
    if (!r.problems[0].includes("CANNOT DETERMINE")) throw new Error("wrong failure mode: " + r.problems[0]);
  });
  t("empty scope is not a vacuous pass", () => {
    const r = analyse({ claims: [], baselineIds: [], healthzSha: "live", ancestorOf: anc });
    eq(r.stats.claims, 0, "claims");
  });

  const bad = T.filter((x) => !x[1]);
  for (const [n, ok, err] of T) console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${err ? " — " + err : ""}`);
  console.log(`${LABEL} --selftest ${bad.length ? "FAIL" : "PASS"} ${T.length - bad.length}/${T.length}`);
  process.exit(bad.length ? 1 : 0);
}

function main() {
  if (SELFTEST) return selftest();
  const manifests = loadManifests();
  const claims = collectClaims(manifests);

  if (WRITE_BASELINE) {
    const ids = claims
      .filter((c) => !c.bound)
      .map((c) => c.id)
      .sort();
    fs.writeFileSync(
      BASELINE,
      JSON.stringify(
        {
          note: "Unbound prod_verified claims that predate verify-prod-verified-live-binding. MAY ONLY SHRINK. Remove an id by stamping that item against live; never re-add.",
          created: new Date().toISOString(),
          ids,
        },
        null,
        2
      ) + "\n"
    );
    console.log(`${LABEL} wrote baseline with ${ids.length} legacy unbound claims`);
    return;
  }

  const { ids: baselineIds } = readBaseline();
  const previousBaselineIds = readCommittedBaseline();
  let healthzSha;
  try {
    healthzSha = fetchHealthzVersionSync();
  } catch (e) {
    console.error(`${LABEL} FAIL — cannot read live healthz: ${e.message}`);
    process.exit(1);
  }
  const resolvable = (ref) => Boolean(expandSha(ROOT, ref));
  if (!resolvable(healthzSha)) {
    try {
      execSync("git fetch -q origin", { cwd: ROOT, stdio: "ignore" });
    } catch {
      /* offline */
    }
  }
  const full = expandSha(ROOT, healthzSha) || healthzSha;
  /** @returns {"yes"|"no"|"unknown"} */
  const ancestorOf = (a, b) => ancestorCheck(ROOT, a, b);

  const { problems, warnings, stats } = analyse({
    claims,
    baselineIds,
    previousBaselineIds,
    healthzSha: full,
    ancestorOf,
  });

  console.log(
    `${LABEL}: live=${healthzSha} claims=${stats.claims} bound=${stats.bound} ` +
      `unbound=${stats.unbound} baseline=${stats.baseline}`
  );
  for (const w of warnings.slice(0, 5)) console.log(`  warn: ${w}`);
  if (warnings.length > 5) console.log(`  warn: …and ${warnings.length - 5} more legacy unbound claims`);
  if (problems.length) {
    console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK`);
}

const isDirect =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirect) main();
