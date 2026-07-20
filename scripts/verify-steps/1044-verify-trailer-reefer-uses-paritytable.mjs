export default {
  name: "verify:trailer-reefer-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-trailer-reefer-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-trailer-reefer-uses-paritytable.mjs"]);
  },
};
