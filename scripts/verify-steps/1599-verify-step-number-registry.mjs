// 1599-verify-step-number-registry — uniqueness from the directory; CLAIMED is documentation only.
//
// HISTORY: This step originally forced every guard PR to edit CLAIMED-NUMBERS.json so two agents
// claiming N would conflict in git. That theory failed in practice:
//   1) GitHub cannot run this repo's merge=json-union driver → every CLAIMED edit shows CONFLICTING
//      on the whole file, thrashing every open PR (same class as package.json before Rule 17).
//   2) TOOL-F03 (verify-verify-step-numbers-unique.mjs, 2026-07-30) already made registration
//      informational: two lanes claiming one number produce TWO FILES, which is the duplicate check.
//   3) Lane parity (Claude ODD / Cursor EVEN) is enforced by verify-verify-step-lane-band.mjs.
//
// WHAT THIS STEP ENFORCES NOW:
//   - NEW duplicate step numbers (not in known_duplicates_frozen) → FAIL
//   - Unclaimed / stale CLAIMED entries → reported only (do not fail the build)
//
// Feature PRs MUST NOT edit CLAIMED-NUMBERS.json. The verify-steps/NNNN-*.mjs filename is the claim.
import fs from "node:fs";
import path from "node:path";

const DIR = "scripts/verify-steps";
const REGISTRY = path.join(DIR, "CLAIMED-NUMBERS.json");

/**
 * @returns {{ problems: string[], notes: string[] }}
 */
export function auditRegistry(dir = DIR, registryPath = REGISTRY) {
  const problems = [];
  const notes = [];
  if (!fs.existsSync(registryPath)) {
    return {
      problems: [`${registryPath} is missing — keep the file as documentation (Rule 07 additive); do not require edits in feature PRs.`],
      notes: [],
    };
  }
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
    if (files.length > 1 && !(num in frozen)) {
      problems.push(
        `verify-step number ${num} is used by ${files.length} files (${files.join(", ")}) and is NOT in ` +
          `known_duplicates_frozen. Pick a free number in YOUR lane band (Cursor EVEN / Claude ODD); ` +
          `the filename is the claim — do NOT edit ${REGISTRY} in feature PRs.`,
      );
      continue;
    }
    if (!(num in claimed) && !(num in frozen)) {
      notes.push(
        `verify-step ${files[0]} number ${num} is not listed in ${REGISTRY} (informational; TOOL-F03).`,
      );
    }
  }

  for (const num of Object.keys(claimed)) {
    if (!onDisk.has(num)) {
      notes.push(
        `${REGISTRY} claims number ${num} but no verify-step file uses it (stale documentation; regen on main separately).`,
      );
    }
  }
  return { problems, notes };
}

export default {
  name: "verify:step-number-registry",
  run() {
    const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "stepreg-"));
    try {
      const regPath = path.join(tmp, "CLAIMED-NUMBERS.json");
      fs.writeFileSync(path.join(tmp, "9101-verify-claimed.mjs"), "export default {};");
      fs.writeFileSync(path.join(tmp, "9102-verify-unclaimed.mjs"), "export default {};");
      fs.writeFileSync(
        regPath,
        JSON.stringify({ claimed: { "9101": "9101-verify-claimed.mjs" }, known_duplicates_frozen: {} }),
      );

      let { problems, notes } = auditRegistry(tmp, regPath);
      if (problems.length !== 0) {
        throw new Error(`SELFTEST FAILED: clean tree must not fail: ${problems.join("; ")}`);
      }
      if (!notes.some((n) => n.includes("9102") && n.includes("not listed"))) {
        throw new Error("SELFTEST FAILED: an unclaimed number must still be REPORTED");
      }

      // duplicate arm — must FAIL
      fs.writeFileSync(path.join(tmp, "9102-verify-unclaimed-b.mjs"), "export default {};");
      ({ problems } = auditRegistry(tmp, regPath));
      if (!problems.some((p) => p.includes("9102") && p.includes("used by"))) {
        throw new Error("SELFTEST FAILED: a NEW duplicate number was not caught");
      }

      // stale claim — informational only
      fs.rmSync(path.join(tmp, "9102-verify-unclaimed-b.mjs"));
      fs.writeFileSync(
        regPath,
        JSON.stringify({
          claimed: {
            "9101": "9101-verify-claimed.mjs",
            "9102": "9102-verify-unclaimed.mjs",
            "9999": "gone.mjs",
          },
          known_duplicates_frozen: {},
        }),
      );
      ({ problems, notes } = auditRegistry(tmp, regPath));
      if (problems.length !== 0) {
        throw new Error(`SELFTEST FAILED: stale claim must not fail the build: ${problems.join("; ")}`);
      }
      if (!notes.some((n) => n.includes("9999"))) {
        throw new Error("SELFTEST FAILED: a stale claim must be reported");
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }

    const { problems, notes } = auditRegistry();
    for (const n of notes.slice(0, 8)) console.log(`  · ${n}`);
    if (notes.length > 8) console.log(`  · … ${notes.length - 8} more informational note(s)`);
    if (problems.length) {
      for (const p of problems) console.error(`  ✗ ${p}`);
      throw new Error(`verify:step-number-registry FAIL — ${problems.length} problem(s)`);
    }
    const reg = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
    console.log(
      `verify:step-number-registry OK — uniqueness from directory; CLAIMED is docs-only ` +
        `(${Object.keys(reg.claimed ?? {}).length} registry rows, ${notes.length} drift note(s)); ` +
        `lane parity = verify-verify-step-lane-band; do not edit CLAIMED in feature PRs.`,
    );
    return 0;
  },
};
