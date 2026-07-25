// 1501-verify-block-docs-committed-and-owner-decides — blocks live in git, and CPA never gates the owner.
//
// WHY (a) — DISPATCHABILITY: every LST-F / SAF-F block doc existed only in a Downloads zip. Zero were
// committed. Work that cannot be read from a checkout cannot be audited, diffed, assigned, or reviewed
// against the code it describes, and it silently disappears when a laptop is wiped. This guard fails if the
// committed set is emptied or falls below the count that landed.
//
// WHY (b) — DECISION AUTHORITY: enabling posting, flipping a flag and ratifying an accounting treatment are
// the OWNER's decisions alone. No external, CPA or accountant sign-off, ever. The imported docs carried 71
// instances of CPA as approver or as a quality bar ("CPA-grade", "owner/CPA must ratify", "if CPA agrees").
// Left in place they read as a standing gate the owner never granted, and a future agent would wait on it.
//
// TWO USES ARE DELIBERATELY ALLOWED, and the guard would be wrong to flag either:
//   * `.claude/skills/ih35-cpa-accounting-decisions` — a REAL file path. Rewriting it breaks a live
//     reference. That agent advises on technical correctness; it never gates the owner.
//   * `AICPA` — the standards body that defines SOC 2 Trust Services Criteria. A citation, not an approver.
// Both are stripped before matching rather than allowlisted per-file, so the exemption cannot silently widen.
import fs from "node:fs";
import path from "node:path";

const BLOCKS_DIR = "docs/blocks";
const MIN_BLOCK_DOCS = 69; // committed 2026-07-25: 31 LST + 36 SAF + 2 standards. May only grow.
const SKILL_PATH = "ih35-cpa-accounting-decisions";

export function cpaAuthorityHits(source) {
  const hits = [];
  source.split("\n").forEach((line, i) => {
    const neutral = line.split(SKILL_PATH).join("").split("AICPA").join("");
    if (/CPA/.test(neutral) && !neutral.includes("CPA was stripped as an approver")) {
      hits.push(`${i + 1}: ${neutral.trim().slice(0, 110)}`);
    }
  });
  return hits;
}

function mdFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) mdFiles(p, out);
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

export default {
  name: "verify:block-docs-committed-and-owner-decides",
  run() {
    // selftest — both arms against synthetic source so neither can pass vacuously.
    if (!cpaAuthorityHits("economics must be CPA-grade before merge").length) {
      throw new Error("SELFTEST FAILED: a planted CPA-as-quality-bar was not caught");
    }
    if (!cpaAuthorityHits("an owner/CPA must ratify the treatment").length) {
      throw new Error("SELFTEST FAILED: a planted CPA-as-approver was not caught");
    }
    const allowed = `see .claude/skills/${SKILL_PATH} — advisory only\n| SOC 2 | AICPA TSC | criteria |`;
    if (cpaAuthorityHits(allowed).length) {
      throw new Error("SELFTEST FAILED: the real skill path or the AICPA citation was flagged");
    }

    const problems = [];
    const files = mdFiles(BLOCKS_DIR);
    if (files.length < MIN_BLOCK_DOCS) {
      problems.push(
        `${BLOCKS_DIR} holds ${files.length} block doc(s), below the ${MIN_BLOCK_DOCS} committed on ` +
          `2026-07-25. Block docs are the dispatchable record — they may be added to, never thinned.`,
      );
    }
    for (const f of files) {
      for (const hit of cpaAuthorityHits(fs.readFileSync(f, "utf8"))) {
        problems.push(
          `${f}:${hit} — CPA appears as an approver or quality bar. Enabling posting, flipping a flag and ` +
            `ratifying a treatment are the OWNER's decisions alone. Use OWNER / audit-grade.`,
        );
      }
    }
    if (problems.length) {
      for (const p of problems) console.error(`  ✗ ${p}`);
      throw new Error(`verify:block-docs-committed-and-owner-decides FAIL — ${problems.length} problem(s)`);
    }
    console.log(
      `verify:block-docs-committed-and-owner-decides OK — ${files.length} block docs committed and ` +
        `dispatchable; no CPA-as-authority (real skill path + AICPA citation retained by design).`,
    );
    return 0;
  },
};
