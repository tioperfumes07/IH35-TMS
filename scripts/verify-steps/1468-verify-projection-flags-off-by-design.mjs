export default {
  name: "verify:projection-flags-off-by-design",
  run(ctx) {
    ctx.run("node", ["scripts/verify-projection-flags-off-by-design.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-projection-flags-off-by-design.mjs"]);
  },
};
