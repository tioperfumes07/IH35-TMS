export default {
  name: "verify:freetime-detention-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-freetime-detention-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-freetime-detention-uses-paritytable.mjs"]);
  },
};
