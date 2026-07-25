export default {
  name: "verify:factoring-queue-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-queue-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-queue-page-uses-paritytable.mjs"]);
  },
};
