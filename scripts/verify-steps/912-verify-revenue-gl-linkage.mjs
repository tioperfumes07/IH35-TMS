export default {
  name: "verify-revenue-gl-linkage",
  run(ctx) {
    // Fail closed: nonzero child exit must terminate the step (Rule 18).
    if (ctx.run("node", ["scripts/verify-revenue-gl-linkage.mjs"]) !== 0) {
      process.exit(1);
    }
    if (ctx.run("node", ["scripts/verify-revenue-gl-linkage.mjs", "--selftest"]) !== 0) {
      process.exit(1);
    }
  },
};
