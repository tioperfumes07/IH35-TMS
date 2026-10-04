export default {
  name: "verify:ui1-no-stub-accounting-modules",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ui1-no-stub-accounting-modules.mjs"]);
  },
};
