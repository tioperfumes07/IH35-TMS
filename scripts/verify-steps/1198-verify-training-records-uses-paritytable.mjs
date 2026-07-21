export default {
  name: "verify:training-records-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-training-records-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-training-records-uses-paritytable.mjs"]);
  },
};
