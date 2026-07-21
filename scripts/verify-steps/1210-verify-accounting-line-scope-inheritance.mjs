// 0519-es1-58 — accounting child-LINE scope-inheritance regression lock + ratchet.
// Rule-17 wiring: runs the standalone guard via ctx.run (which throws on any non-zero exit),
// so no package.json / locked-guards / ci.yml edits are needed. Self-test first, then the guard.
export default {
  name: "accounting-line-scope-inheritance",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-line-scope-inheritance.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-accounting-line-scope-inheritance.mjs"]);
  },
};
