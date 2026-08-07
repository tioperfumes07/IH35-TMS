#!/usr/bin/env node
/**
 * PERMANENT LAW (owner-locked 2026-08-05) §2 — "LAW = ENFORCED GUARD, OR IT IS NOT LAW".
 *
 * THE DEFECT THIS CLOSES: the law itself has been on main since 2026-08-05 (it is quoted verbatim in
 * docs/lockdown/00_LOCKED_DECISIONS.md, docs/audit/GUARD-WORKORDERS.md, docs/CLAUDE.md, AGENTS.md and
 * .cursor/rules/00-always-read-first.mdc) and it names two artifacts by path — `docs/law/LAW.json` and
 * `scripts/verify-law-registry.mjs`. NEITHER EXISTED. So the one rule whose entire subject is "a rule
 * with no guard is not a rule" was itself unguarded, and every rule underneath it inherited that hole:
 * nothing on main could answer "which locked decisions are actually enforced, and by what file?" That
 * is why answered owner decisions keep getting re-asked and re-litigated every session — the registry
 * that would have made the answer citable in one grep was never built.
 *
 * WHAT THIS GUARD IS: an EXISTENCE check over docs/law/LAW.json, and nothing more.
 *   - every entry is structurally well-formed (id / title / source_file / guard / type)
 *   - ids are unique
 *   - type='enforced'  => `guard` is a path that RESOLVES ON DISK  <- the load-bearing assertion
 *   - type='judgment'  => `guard` is null (a judgment rule must not pretend to be enforced)
 *   - every `source_file` resolves on disk (a law whose source doc was renamed is unciteable)
 *
 * WHAT IT DELIBERATELY IS NOT: it does NOT run the guards, does not read their contents, does not
 * assert they are wired into CI, and does not judge whether a guard actually enforces its law. Those
 * are other checks' jobs (verify-guard-wired, and the guards themselves). This one is designed to cost
 * ~50ms so it can be a REQUIRED check on every PR without adding measurable PR time — per the law's
 * own wording, "<2s, existence-only, adds ZERO PR time". A cheap check that always runs beats an
 * expensive one that gets skipped.
 *
 * THE FAILURE MODE IT CATCHES: someone deletes, renames, or never lands a guard that a locked decision
 * claims enforces it. Today that is invisible — the doc keeps asserting enforcement that no longer
 * exists. After this, the build goes red naming the (id, guard) pair.
 *
 * REGISTERING A NEW LAW: append an entry to docs/law/LAW.json (see docs/law/README.md). If the rule is
 * mechanically checkable, ship its guard in the SAME PR and set type='enforced'. If it is a judgment
 * rule ("professional", "McLeod-quality"), set type='judgment' and guard=null — judgment rules are not
 * force-guarded, but they ARE registered, so the set of live law is enumerable in one file.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-law-registry";
const REGISTRY_REL = "docs/law/LAW.json";
const REGISTRY_ABS = path.join(ROOT, REGISTRY_REL);
const VALID_TYPES = new Set(["enforced", "judgment"]);

/**
 * Pure audit. Takes the parsed registry, returns a list of human-readable problems.
 * Kept pure and exported so it can be exercised without touching disk, and so any future caller can
 * reuse the rule instead of re-implementing it (a second copy is a copy that will disagree).
 */
export function auditRegistry(entries, fileExists = (rel) => existsSync(path.join(ROOT, rel))) {
  const problems = [];

  if (!Array.isArray(entries)) {
    return [`${REGISTRY_REL} must be a JSON ARRAY of law entries (got ${typeof entries}).`];
  }
  if (entries.length === 0) {
    return [`${REGISTRY_REL} is empty — the law registry may never be emptied (WORM / additive-only).`];
  }

  const seen = new Map();
  entries.forEach((entry, i) => {
    const at = `entry[${i}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push(`${at}: not an object.`);
      return;
    }

    const { id, title, source_file: sourceFile, guard, type } = entry;
    const who = typeof id === "string" && id ? id : at;

    if (typeof id !== "string" || !id.trim()) {
      problems.push(`${at}: missing/blank "id".`);
    } else if (seen.has(id)) {
      problems.push(`${who}: duplicate id — first seen at entry[${seen.get(id)}]. Ids must be unique.`);
    } else {
      seen.set(id, i);
    }

    if (typeof title !== "string" || !title.trim()) {
      problems.push(`${who}: missing/blank "title" — a law nobody can read is not citable.`);
    }

    if (typeof type !== "string" || !VALID_TYPES.has(type)) {
      problems.push(
        `${who}: "type" must be one of ${[...VALID_TYPES].join("|")} (got ${JSON.stringify(type)}).`,
      );
    }

    if (typeof sourceFile !== "string" || !sourceFile.trim()) {
      problems.push(`${who}: missing/blank "source_file" — every law names the locked doc it lives in.`);
    } else if (!fileExists(sourceFile)) {
      problems.push(`${who}: source_file does not exist on disk — ${sourceFile}`);
    }

    if (type === "enforced") {
      if (typeof guard !== "string" || !guard.trim()) {
        problems.push(
          `${who}: type='enforced' but "guard" is ${JSON.stringify(guard)}. ` +
            `An enforced law names the guard file that enforces it, or it is type='judgment'.`,
        );
      } else if (!fileExists(guard)) {
        // THE assertion this whole check exists for.
        problems.push(
          `${who}: MISSING GUARD — registered as enforced by "${guard}", which does not exist on disk. ` +
            `LAW = ENFORCED GUARD, OR IT IS NOT LAW: restore the guard, or reclassify the law as judgment.`,
        );
      }
    } else if (type === "judgment" && guard !== null && guard !== undefined) {
      problems.push(
        `${who}: type='judgment' must carry "guard": null (got ${JSON.stringify(guard)}). ` +
          `A judgment rule must not advertise enforcement it does not have.`,
      );
    }
  });

  return problems;
}

function readRegistry() {
  if (!existsSync(REGISTRY_ABS)) {
    throw new Error(
      `${LABEL}: ${REGISTRY_REL} does not exist. PERMANENT LAW 2026-08-05 §2 requires it — ` +
        `it is the single enumerable list of live law and may not be deleted.`,
    );
  }
  const raw = readFileSync(REGISTRY_ABS, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${LABEL}: ${REGISTRY_REL} is not valid JSON — ${err.message}`);
  }
}

function run() {
  let entries;
  try {
    entries = readRegistry();
  } catch (err) {
    console.error(`  x ${err.message}`);
    return 1;
  }

  const problems = auditRegistry(entries);
  if (problems.length) {
    console.error(`${LABEL}: FAIL — ${problems.length} problem(s) in ${REGISTRY_REL}`);
    for (const p of problems) console.error(`  x ${p}`);
    return 1;
  }

  const enforced = entries.filter((e) => e.type === "enforced").length;
  const judgment = entries.length - enforced;
  console.log(
    `${LABEL} OK — ${entries.length} law(s) registered: ${enforced} enforced ` +
      `(every guard file resolves on disk), ${judgment} judgment.`,
  );
  return 0;
}

/**
 * SELFTEST — RED-on-plant / GREEN-on-restore, proven with REAL exit codes from a REAL subprocess
 * against the REAL registry file. An in-memory-only selftest would not prove that the ON-DISK
 * existence check is the thing that reddens, which is the entire contract here.
 *
 * The original bytes are buffered before the first write and restored in `finally`, so the working
 * tree is byte-identical afterwards even if a case throws.
 */
function selftest() {
  const original = readFileSync(REGISTRY_ABS, "utf8");
  const failures = [];

  const runSelf = () => {
    const res = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: ROOT,
      encoding: "utf8",
    });
    return { code: res.status ?? 1, out: `${res.stdout ?? ""}${res.stderr ?? ""}` };
  };

  const plant = (mutate) => {
    const entries = JSON.parse(original);
    mutate(entries);
    writeFileSync(REGISTRY_ABS, JSON.stringify(entries, null, 2) + "\n");
  };

  try {
    // case 1 — GREEN baseline: the registry as committed must pass.
    const base = runSelf();
    console.log(`${LABEL}: selftest case1 (real registry, unmodified) -> exit ${base.code}`);
    if (base.code !== 0) {
      failures.push(`case1 FAIL — committed registry should be GREEN, got exit ${base.code}\n${base.out}`);
    }

    // case 2 — RED on plant: an enforced law whose guard file does not exist.
    const PHANTOM = "scripts/verify-__law-registry-selftest-phantom__.mjs";
    plant((entries) =>
      entries.push({
        id: "LAW-SELFTEST-PLANT-MISSING-GUARD",
        title: "selftest plant — enforced law pointing at a guard that does not exist",
        source_file: REGISTRY_REL,
        guard: PHANTOM,
        type: "enforced",
      }),
    );
    const planted = runSelf();
    console.log(`${LABEL}: selftest case2 (planted missing guard) -> exit ${planted.code}`);
    if (planted.code === 0) {
      failures.push(
        "case2 FAIL — a registered enforced law with a NON-EXISTENT guard file did not go RED.",
      );
    } else if (!planted.out.includes("LAW-SELFTEST-PLANT-MISSING-GUARD") || !planted.out.includes(PHANTOM)) {
      failures.push(`case2 FAIL — RED, but the output did not name the (id, guard) pair:\n${planted.out}`);
    }

    // case 3 — GREEN on restore: removing the plant returns the check to green.
    writeFileSync(REGISTRY_ABS, original);
    const restored = runSelf();
    console.log(`${LABEL}: selftest case3 (restored) -> exit ${restored.code}`);
    if (restored.code !== 0) {
      failures.push(`case3 FAIL — restore should be GREEN, got exit ${restored.code}\n${restored.out}`);
    }

    // case 4 — RED on a judgment law that claims a guard (enforcement it does not have).
    plant((entries) =>
      entries.push({
        id: "LAW-SELFTEST-PLANT-JUDGMENT-WITH-GUARD",
        title: "selftest plant — judgment law advertising a guard",
        source_file: REGISTRY_REL,
        guard: "scripts/verify-law-registry.mjs",
        type: "judgment",
      }),
    );
    const judged = runSelf();
    console.log(`${LABEL}: selftest case4 (judgment law carrying a guard) -> exit ${judged.code}`);
    if (judged.code === 0) failures.push("case4 FAIL — judgment law with a non-null guard must go RED.");

    // case 5 — RED on a duplicate id (two rows of law claiming the same identity).
    writeFileSync(REGISTRY_ABS, original);
    plant((entries) => entries.push({ ...entries[0] }));
    const dup = runSelf();
    console.log(`${LABEL}: selftest case5 (duplicate id) -> exit ${dup.code}`);
    if (dup.code === 0) failures.push("case5 FAIL — a duplicate law id must go RED.");

    // case 6 — RED on an enforced law with guard:null (the "registered but unenforced" hole).
    writeFileSync(REGISTRY_ABS, original);
    plant((entries) =>
      entries.push({
        id: "LAW-SELFTEST-PLANT-ENFORCED-NULL-GUARD",
        title: "selftest plant — enforced law with no guard named",
        source_file: REGISTRY_REL,
        guard: null,
        type: "enforced",
      }),
    );
    const nullGuard = runSelf();
    console.log(`${LABEL}: selftest case6 (enforced law, guard:null) -> exit ${nullGuard.code}`);
    if (nullGuard.code === 0) failures.push("case6 FAIL — enforced law with guard:null must go RED.");
  } finally {
    // Byte-for-byte restore, always.
    writeFileSync(REGISTRY_ABS, original);
  }

  if (readFileSync(REGISTRY_ABS, "utf8") !== original) {
    failures.push("restore FAIL — registry not byte-identical after selftest.");
  }

  if (failures.length) {
    for (const f of failures) console.error(`  x ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — GREEN(0) on the real registry, RED(1) on a planted missing guard naming ` +
      `(id, guard), GREEN(0) again after restore; judgment-with-guard, duplicate id and ` +
      `enforced-with-null-guard all RED. Registry restored byte-identical.`,
  );
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run());
