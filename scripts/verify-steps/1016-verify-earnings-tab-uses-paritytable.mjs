export default {
  name: "verify:earnings-tab-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-earnings-tab-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-earnings-tab-uses-paritytable.mjs"]);
  },
};
