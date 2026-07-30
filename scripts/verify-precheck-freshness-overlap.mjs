#!/usr/bin/env node
/**
 * GUARD — the local pre-push freshness gate must agree with CI's freshness gate.
 *
 * THE DEFECT THIS ASSERTS (2026-07-29): scripts/verify-branch-fresh.mjs (CI) had already moved to
 * "behind is fine, behind-and-OVERLAPPING is not", but scripts/branch-precheck-push.mjs (the husky
 * pre-push hook) still failed on ANY behind count. The two enforcement points disagreed, so a branch
 * CI would merge without complaint could not even be pushed. Every unrelated merge to main invalidated
 * every open branch — the N^2 rebuild treadmill the overlap rule exists to kill. Measured that day:
 * two full rebuilds of branches whose file sets did not intersect main's changes at all.
 *
 * This guard fails if anyone restores the zero-behind rule, because ARM 1 asserts the exact case the
 * old rule got wrong: behind, but touching nothing main touched.
 *
 * It also pins the parts of strictness that must NOT be relaxed — overlap and globally-allocated
 * paths still block — so "align with CI" can never quietly become "stop checking".
 */
import { freshnessVerdict, COUPLED_ALLOCATION_PREFIXES } from "./branch-precheck-push.mjs";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
};

console.log("verify:precheck-freshness-overlap");

// ARM 1 — THE DEFECT. Behind main, but the two sides changed disjoint files. Must PASS.
// Under the old zero-behind rule this returned ok:false. If this arm ever fails, the treadmill is back.
const disjoint = freshnessVerdict({
  behind: 14,
  mainFiles: ["apps/backend/src/routes/loads.ts", "docs/specs/SOMETHING.md"],
  branchFiles: ["scripts/branch-precheck-push.mjs"],
});
check("behind but disjoint => allowed (the zero-behind defect)", disjoint.ok === true, JSON.stringify(disjoint.reason));

// ARM 2 — same file changed on both sides. Must FAIL: CI validated a combination that will never exist.
const overlapping = freshnessVerdict({
  behind: 3,
  mainFiles: ["apps/backend/src/routes/loads.ts"],
  branchFiles: ["apps/backend/src/routes/loads.ts", "README.md"],
});
check("behind and sharing a changed file => blocked", overlapping.ok === false);
check("overlap reason names the shared file", String(overlapping.reason).includes("loads.ts"));

// ARM 3 — globally allocated paths. DIFFERENT files under the same prefix must still block, because
// the shared resource is the NUMBER, not the filename. Overlap-by-name alone cannot catch this.
for (const prefix of COUPLED_ALLOCATION_PREFIXES) {
  const a = prefix.endsWith("/") ? `${prefix}0001_alpha.sql` : prefix;
  const b = prefix.endsWith("/") ? `${prefix}0002_beta.sql` : prefix;
  const coupled = freshnessVerdict({ behind: 2, mainFiles: [a], branchFiles: [b] });
  check(`coupled prefix ${prefix} blocks even with different filenames`, coupled.ok === false);
}

// ARM 4 — not behind at all. Must PASS without consulting file lists.
check("not behind => allowed", freshnessVerdict({ behind: 0, mainFiles: ["x"], branchFiles: ["x"] }).ok === true);

// ARM 5 — MUTATION ARM. Prove ARM 1 can actually fail: a zero-behind implementation must be rejected
// by the very assertion ARM 1 makes. A selftest that cannot fail is not a selftest.
const zeroBehindImpl = ({ behind }) => (behind > 0 ? { ok: false, reason: "behind" } : { ok: true });
check(
  "mutation: a zero-behind implementation would fail ARM 1",
  zeroBehindImpl({ behind: 14, mainFiles: [], branchFiles: [] }).ok === false
);

if (failures > 0) {
  console.error(`\nverify:precheck-freshness-overlap FAILED (${failures})`);
  process.exit(1);
}
console.log("verify:precheck-freshness-overlap PASS");
