export default {
  name: "verify:drug-alcohol-program-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drug-alcohol-program-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-drug-alcohol-program-uses-paritytable.mjs"]);
  },
};
