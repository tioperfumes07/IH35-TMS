// 1599-verify-step-number-registry — a verify-step number must be CLAIMED in the registry.
//
// WHY THIS EXISTS: on 2026-07-26 there were SIX verify-step number collisions in a single session
// (1520 x2, 1521 x2, 1552 x2, and three earlier). Every one followed the same shape and none was
// anyone's carelessness:
//
//   agent A checks origin/main + `git branch -r`, sees N is free, claims N
//   agent B does exactly the same check, at the same time, and also claims N
//   both PRs go GREEN, because on each branch in isolation N is unique
//   whichever merges second puts TWO files numbered N on main
//   the duplicate-number ratchet (1486) then FAILS EVERY BRANCH CUT FROM MAIN — including branches
//   belonging to neither agent
//
// Convention-based allocation cannot fix this. Checking harder cannot fix it either: a number can be
// claimed in the window between one agent's check and its merge. The race is structural.
//
// THE FIX IS NOT DETECTION, IT IS CONTENTION. Every guard PR must also add its number to
// CLAIMED-NUMBERS.json. Two agents claiming N then edit the SAME LINE of the SAME FILE, so git raises
// a merge conflict on the second PR — loudly, before merge, to the agent who can still change it.
// An invisible race becomes an ordinary conflict, which is where it belongs.
//
// The 87 pre-existing duplicate groups are frozen in `known_duplicates_frozen` as historical debt.
// They are NOT a licence to add more: this guard only permits a duplicate that is already frozen, and
// verify-step 1486 separately enforces that the frozen list may only SHRINK.
import fs from "node:fs";
import path from "node:path";

const DIR = "scripts/verify-steps";
const REGISTRY = path.join(DIR, "CLAIMED-NUMBERS.json");
const SELF = "1599-verify-step-number-registry.mjs";

export function auditRegistry(dir = DIR, registryPath = REGISTRY) {
  const problems = [];
  if (!fs.existsSync(registryPath)) return [`${registryPath} is missing — the claim registry is the allocation mechanism, not documentation.`];
  const reg = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const claimed = reg.claimed ?? {};
  const frozen = reg.known_duplicates_frozen ?? {};

  const onDisk = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".mjs") || f.startsWith("_")) continue;
    const m = /^(\d+)-/.exec(f);
    if (!m) continue;
    if (!onDisk.has(m[1])) onDisk.set(m[1], []);
    onDisk.get(m[1]).push(f);
  }

  for (const [num, files] of onDisk) {
    // A number may hold >1 file ONLY if that exact group is already frozen as historical debt.
    if (files.length > 1 && !(num in frozen)) {
      problems.push(
        `verify-step number ${num} is used by ${files.length} files (${files.join(", ")}) and is NOT in ` +
          `known_duplicates_frozen. Claim a free number and record it in ${REGISTRY}.`,
      );
      continue;
    }
    if (!(num in claimed) && !(num in frozen)) {
      problems.push(
        `verify-step ${files[0]} uses number ${num} but ${num} is NOT claimed in ${REGISTRY}. ` +
          `Add "${num}": "${files[0]}" in the SAME commit as the guard — that is what makes a concurrent ` +
          `claimant collide in git instead of silently reddening main after the merge.`,
      );
    }
  }

  // The registry must not drift into fiction: a claim with no file is a number nobody can reuse.
  for (const num of Object.keys(claimed)) {
    if (!onDisk.has(num)) {
      problems.push(
        `${REGISTRY} claims number ${num} but no verify-step file uses it. Remove the stale claim, or the ` +
          `registry silently burns numbers.`,
      );
    }
  }
  return problems;
}

export default {
  name: "verify:step-number-registry",
  run() {
    // selftest — both arms on a synthetic dir so neither can pass vacuously.
    const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "stepreg-"));
    try {
      const regPath = path.join(tmp, "CLAIMED-NUMBERS.json");
      fs.writeFileSync(path.join(tmp, "9101-verify-claimed.mjs"), "export default {};");
      fs.writeFileSync(path.join(tmp, "9102-verify-unclaimed.mjs"), "export default {};");
      fs.writeFileSync(regPath, JSON.stringify({ claimed: { "9101": "9101-verify-claimed.mjs" }, known_duplicates_frozen: {} }));

      const hits = auditRegistry(tmp, regPath);
      if (!hits.some((p) => p.includes("9102") && p.includes("NOT claimed"))) {
        throw new Error("SELFTEST FAILED: an unclaimed number was not caught");
      }
      if (hits.some((p) => p.includes("9101"))) {
        throw new Error("SELFTEST FAILED: a properly claimed number was flagged");
      }
      // stale-claim arm
      fs.writeFileSync(regPath, JSON.stringify({ claimed: { "9101": "9101-verify-claimed.mjs", "9102": "9102-verify-unclaimed.mjs", "9999": "gone.mjs" }, known_duplicates_frozen: {} }));
      if (!auditRegistry(tmp, regPath).some((p) => p.includes("9999") && p.includes("no verify-step file"))) {
        throw new Error("SELFTEST FAILED: a stale claim was not caught");
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }

    const problems = auditRegistry();
    if (problems.length) {
      for (const p of problems) console.error(`  ✗ ${p}`);
      throw new Error(`verify:step-number-registry FAIL — ${problems.length} problem(s)`);
    }
    const reg = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
    console.log(
      `verify:step-number-registry OK — ${Object.keys(reg.claimed ?? {}).length} numbers claimed, ` +
        `${Object.keys(reg.known_duplicates_frozen ?? {}).length} historical duplicate group(s) frozen; ` +
        `a concurrent claimant now conflicts in git rather than reddening main.`,
    );
    return 0;
  },
};
