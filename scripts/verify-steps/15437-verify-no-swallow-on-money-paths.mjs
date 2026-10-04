export default {
  name: "verify:no-swallow-on-money-paths",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-swallow-on-money-paths.mjs"]);
  },
};
