export default {
  name: "verify:earnings-section-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-earnings-section-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-earnings-section-uses-paritytable.mjs"]);
  },
};
