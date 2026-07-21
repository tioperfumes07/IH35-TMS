export default {
  name: "verify:revenue-recognition-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-revenue-recognition-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-revenue-recognition-page-uses-paritytable.mjs"]);
  },
};
