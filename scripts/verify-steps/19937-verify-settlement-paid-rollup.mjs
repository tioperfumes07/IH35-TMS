export default {
  name: "verify:verify-settlement-paid-rollup",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-paid-rollup.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-paid-rollup.mjs"]);
  },
};
