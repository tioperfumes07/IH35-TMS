export default {
  name: "verify:factoring-active-factor-count-not-hardcoded",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-active-factor-count-not-hardcoded.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-active-factor-count-not-hardcoded.mjs"]);
  },
};
