export default {
  name: "verify:trailer-plates-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-trailer-plates-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-trailer-plates-uses-paritytable.mjs"]);
  },
};
