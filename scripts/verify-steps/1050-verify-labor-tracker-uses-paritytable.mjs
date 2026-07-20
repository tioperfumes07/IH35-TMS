export default {
  name: "verify:labor-tracker-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-labor-tracker-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-labor-tracker-uses-paritytable.mjs"]);
  },
};
