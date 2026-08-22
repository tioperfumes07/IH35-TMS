export default {
  name: "verify:factoring-recourse-view-real-cents-columns",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-recourse-view-real-cents-columns.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-recourse-view-real-cents-columns.mjs"]);
  },
};
