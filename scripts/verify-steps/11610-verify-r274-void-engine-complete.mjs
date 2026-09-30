// ROUND 274 — void engine completeness (claim 11610 on origin/main via #23178).
export default {
  name: "verify:r274-void-engine-complete",
  run(ctx) {
    ctx.run("node", ["scripts/verify-r274-void-engine-complete.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-r274-void-engine-complete.mjs"]);
  },
};
