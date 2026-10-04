export default {
  name: "verify:safety-integrity-engine-complete-nonmoney-scan",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-integrity-engine-complete-nonmoney-scan.mjs"]);
  },
};
