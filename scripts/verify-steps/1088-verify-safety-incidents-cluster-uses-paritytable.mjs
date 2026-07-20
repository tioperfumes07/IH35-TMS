export default {
  name: "verify:safety-incidents-cluster-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-incidents-cluster-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-incidents-cluster-uses-paritytable.mjs"]);
  },
};
