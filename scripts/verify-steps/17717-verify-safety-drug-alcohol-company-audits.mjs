export default {
  name: "verify:safety-drug-alcohol-company-audits",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-drug-alcohol-company-audits.mjs"]);
  },
};
