export default {
  name: "verify:money-creates-supply-sample-flag",
  run(ctx) {
    ctx.run("node", ["scripts/verify-money-creates-supply-sample-flag.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-money-creates-supply-sample-flag.mjs"]);
  },
};
