// 1484-verify-no-duplicate-route-registrations — one absolute route path, one registration.
//
// WHY: apps/frontend/src/routes/manifest.tsx registered `/compliance` and `/notifications` TWICE each, as
// byte-identical <Route> blocks ~2700 lines apart (same path, same element, same <ProtectedRoute> wrapper).
// React Router resolves the first match, so the second block was permanently unreachable. It cost nothing at
// runtime, which is exactly why it survived: a dead duplicate is invisible until someone edits the wrong copy
// and cannot work out why the change has no effect. That is a real trap in a 551-route manifest.
//
// ONLY ABSOLUTE PATHS ARE CHECKED. Relative children legitimately repeat — `settings`, `hos` and `loads/:id`
// each appear twice under DIFFERENT parents (office portal vs driver app) and resolve to different URLs. A
// naive uniqueness check over every path= would flag those three and would have to be weakened or bypassed to
// land; scoping to leading-slash paths keeps the assertion true without an allowlist.
import fs from "node:fs";

const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

export function findDuplicateAbsoluteRoutes(source) {
  const counts = new Map();
  for (const m of source.matchAll(/path="(\/[^"]*)"/g)) {
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([p, n]) => `route path "${p}" is registered ${n} times — only the first is reachable`);
}

export default {
  name: "verify:no-duplicate-route-registrations",
  run() {
    // selftest — both arms against synthetic source, so neither can pass vacuously.
    const dirty = `<Route path="/a" /><Route path="/b" /><Route path="/a" />`;
    if (!findDuplicateAbsoluteRoutes(dirty).some((p) => p.includes('"/a"'))) {
      throw new Error("SELFTEST FAILED: a planted duplicate absolute route was not caught");
    }
    // relative repeats under different parents must NOT be flagged (the /compliance fix must not
    // regress into breaking legitimate portal-vs-driver children).
    const relative = `<Route path="settings" /><Route path="settings" /><Route path="/x" />`;
    if (findDuplicateAbsoluteRoutes(relative).length) {
      throw new Error("SELFTEST FAILED: legitimate repeated RELATIVE child paths were flagged");
    }

    const problems = findDuplicateAbsoluteRoutes(fs.readFileSync(MANIFEST, "utf8"));
    if (problems.length) {
      for (const p of problems) console.error(`  ✗ ${p}`);
      throw new Error(`verify:no-duplicate-route-registrations FAIL — ${problems.length} duplicate path(s)`);
    }
    console.log("verify:no-duplicate-route-registrations OK — every absolute route path registered exactly once.");
    return 0;
  },
};
