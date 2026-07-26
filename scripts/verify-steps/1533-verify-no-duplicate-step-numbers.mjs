// 1533-verify-no-duplicate-step-numbers — verify-step NUMBER uniqueness ratchet.
//
// Deliberately a NUMBERED step, not an `_meta-` file. Rule 17 wires guards through
// `scripts/verify-steps/NNNN-*.mjs` only, and the runner in verify-pre-commit.mjs filters with
// `!f.startsWith("_")` — an underscore-prefixed guard would never execute under it and would need a second
// registration in scripts/verify-guards/ to run at all. A guard that polices numbering while being exempt
// from numbering is also the weaker design: 1487 is claimed like any other, so this file is subject to the
// rule it enforces.
//
// Originally authored as 1483 — which collided with 1483-verify-held-registry-ledger-parity.mjs on an open
// branch. Renumbered to 1486, which then collided with 1486-verify-bankfeed-je-match.mjs landing on main
// from another PR while this branch was open. A duplicate-number guard that itself duplicated a number —
// twice — is the strongest possible argument for its own existence: checking the numbers in MY tree is not
// enough when other open PRs and main can claim the same number before this one merges. Renumbered to 1533 after colliding with held-set-covers-every-section + C6 1503 on main (2026-07-26).
//
// WHY THIS EXISTS: 87 distinct numeric-prefix collision groups exist in scripts/verify-steps/ — one number
// is shared by SIX files. It does NOT shadow anything: verify-pre-commit.mjs enumerates full filenames and
// runs every file, so every guard still executes. The damage is to TRACEABILITY, and it lands squarely on the
// money gate: every money commit must carry `GUARD: scripts/verify-steps/NNN-...`, and when NNN identifies
// two or more files that reference is ambiguous — a reviewer cannot tell which guard the commit claims. The
// repo has already renumbered once for exactly this reason (4c2ac73497).
//
// SHRINK-ONLY DEBT, not a big bang: failing all 87 today would block every PR, so the existing groups are
// frozen below and only NEW collisions fail. A frozen group that gets resolved must be removed from the list
// (the guard fails until it is), so the inventory cannot go stale or become a parking lot — it can only
// shrink. That is the same ratchet shape used for the fixture-writer prod-refusal debt.
import fs from "node:fs";
import path from "node:path";

const STEPS_DIR = "scripts/verify-steps";

// Frozen 2026-07-25. Numbers currently shared by 2+ files. May only SHRINK.
const KNOWN_COLLISIONS = new Set([
  "15","17","28","29","30","39","45","46","47","48","49","51","52","57","59","60","61","62","63","64","65",
  "66","68","81","100","101","115","117","121","128","134","136","140","141","142","145","907","909","910",
  "990","992","993","994","996","1012","1023","1024","1028","1038","1045","1060","1095","1200","1208",
  "1210","1212","1213","1222","1226","1230","1231","1232","1234","1235","1236","1248","1251","1272","1275",
  "1276","1295","1312","1321","1322","1323","1324","1325","1351","1402","1419","1421","1422","1432","1433",
  "1436","1437","1445",
]);

function collisionMap(dir) {
  const byNumber = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".mjs") || f.startsWith("_")) continue;
    const m = /^(\d+)-/.exec(f);
    if (!m) continue;
    if (!byNumber.has(m[1])) byNumber.set(m[1], []);
    byNumber.get(m[1]).push(f);
  }
  return byNumber;
}

// `frozen` is a parameter, not a closed-over constant, so the selftest can exercise BOTH arms against a
// synthetic directory — including the shrink arm, which is otherwise unreachable in a test.
export function assertNoDuplicateStepNumbers(dir = STEPS_DIR, frozen = KNOWN_COLLISIONS) {
  const problems = [];
  const byNumber = collisionMap(dir);

  for (const [num, files] of byNumber) {
    if (files.length > 1 && !frozen.has(num)) {
      problems.push(
        `verify-step number ${num} is used by ${files.length} files (${files.join(", ")}) — a money commit's ` +
          `\`GUARD: scripts/verify-steps/${num}-...\` reference would be ambiguous. Claim the next free number.`,
      );
    }
  }
  for (const num of frozen) {
    const files = byNumber.get(num) ?? [];
    if (files.length <= 1) {
      problems.push(
        `verify-step number ${num} is listed in KNOWN_COLLISIONS but no longer collides (${files.length} file). ` +
          `Remove it from the list — this ratchet may only shrink.`,
      );
    }
  }
  return problems;
}

export default {
  name: "verify:no-duplicate-step-numbers",
  run(ctx) {
    // --selftest: a synthetic dir exercises all FOUR behaviours against a synthetic frozen set. The first
    // draft of this selftest called the real KNOWN_COLLISIONS against a temp dir and failed on all 87 frozen
    // numbers — the shrink arm firing correctly for the wrong reason. Passing `frozen` explicitly is what
    // makes each arm provable in isolation.
    const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "stepnum-"));
    try {
      const none = new Set();
      fs.writeFileSync(path.join(tmp, "9001-verify-alpha.mjs"), "export default {};");
      fs.writeFileSync(path.join(tmp, "9001-verify-beta.mjs"), "export default {};");

      // arm 1 — a NEW collision must be caught.
      if (!assertNoDuplicateStepNumbers(tmp, none).some((p) => p.includes("9001"))) {
        throw new Error("SELFTEST FAILED: a planted NEW collision (9001 x2) was not caught");
      }
      // arm 2 — the same collision, once frozen, must be tolerated (that is the debt allowance).
      const tolerated = assertNoDuplicateStepNumbers(tmp, new Set(["9001"]));
      if (tolerated.length) {
        throw new Error(`SELFTEST FAILED: a frozen collision was still flagged — ${tolerated.join(" | ")}`);
      }
      // arm 3 — resolve the collision and the stale freeze entry must now fail (shrink-only).
      fs.rmSync(path.join(tmp, "9001-verify-beta.mjs"));
      const stale = assertNoDuplicateStepNumbers(tmp, new Set(["9001"]));
      if (!stale.some((p) => p.includes("no longer collides"))) {
        throw new Error("SELFTEST FAILED: a resolved-but-still-frozen number did not trigger the shrink rule");
      }
      // arm 4 — clean dir, empty freeze set: silent.
      const clean = assertNoDuplicateStepNumbers(tmp, none);
      if (clean.length) {
        throw new Error(`SELFTEST FAILED: clean dir flagged — ${clean.join(" | ")}`);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }

    const problems = assertNoDuplicateStepNumbers();
    if (problems.length) {
      for (const p of problems) console.error(`  ✗ ${p}`);
      throw new Error(`verify:no-duplicate-step-numbers FAIL — ${problems.length} problem(s)`);
    }
    console.log(
      `verify:no-duplicate-step-numbers OK — selftest caught a planted collision; no NEW duplicates beyond the ${KNOWN_COLLISIONS.size} frozen groups.`,
    );
    return 0;
  },
};
