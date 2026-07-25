#!/usr/bin/env node
/**
 * GUARD (block 13 OWNER-EYES): freeze expected CoA postable counts 947/389/53.
 * This PR must not ship SQL that toggles is_postable. Fixture is the ratchet;
 * Neon re-proof is owner/GUARD live step (not required for CI shape check).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-coa-postable-count-stability";
const FIXTURE = "scripts/lib/coa-postable-count-stability.json";
const REPORT = "docs/trackers/COA-ASYMMETRY-2026-07-25.md";
const EXPECTED = { TRK: 947, TRANSP: 389, USMCA: 53 };

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertCoaPostableStability(sources) {
  const problems = [];
  const fixture = JSON.parse(sources[FIXTURE] ?? read(FIXTURE));
  const report = sources[REPORT] ?? read(REPORT);
  const got = fixture.postable_by_company_code ?? {};
  for (const [code, n] of Object.entries(EXPECTED)) {
    if (got[code] !== n) {
      problems.push(`${FIXTURE}: ${code} postable expected ${n}, got ${got[code]} (OWNER-EYES freeze — do not "fix" by editing fixture without Neon proof)`);
    }
    if (!report.includes(String(n))) {
      problems.push(`${REPORT}: must document frozen count ${n} for ${code}`);
    }
  }
  if (!/Do NOT change any `is_postable`/i.test(report) && !/Do NOT change any \*?is_postable/i.test(report)) {
    problems.push(`${REPORT}: must state Do NOT change is_postable`);
  }
  // Repo-wide: no migration in this tree should SET is_postable without OWNER note — ratchet scans recent CoA asymmetry companion only.
  // Soft check: report exists and fixture matches.
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = { [FIXTURE]: read(FIXTURE), [REPORT]: read(REPORT) };
  const brokenFixture = JSON.parse(real[FIXTURE]);
  brokenFixture.postable_by_company_code.TRANSP = 220; // the false number that must stay dead
  const broken = { ...real, [FIXTURE]: JSON.stringify(brokenFixture) };
  if (!assertCoaPostableStability(broken).some((p) => p.includes("TRANSP"))) {
    console.error(`${LABEL} --selftest FAIL: fixture drift not flagged`);
    process.exit(1);
  }
  const good = assertCoaPostableStability(real);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = assertCoaPostableStability({});
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — CoA postable freeze 947/389/53 locked (OWNER-EYES).`);
}
