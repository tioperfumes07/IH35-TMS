export default {
  name: "verify:factoring-nested-box-baseline",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-nested-box-baseline.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-nested-box-baseline.mjs"]);
  },
};
