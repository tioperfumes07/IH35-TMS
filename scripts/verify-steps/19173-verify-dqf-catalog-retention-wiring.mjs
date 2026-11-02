export default {
  name: "verify:dqf-catalog-retention-wiring",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dqf-catalog-retention-wiring.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dqf-catalog-retention-wiring.mjs"]);
  },
};
