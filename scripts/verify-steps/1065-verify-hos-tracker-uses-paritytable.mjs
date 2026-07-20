export default {
  name: "verify:hos-tracker-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-hos-tracker-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-hos-tracker-uses-paritytable.mjs"]);
  },
};
