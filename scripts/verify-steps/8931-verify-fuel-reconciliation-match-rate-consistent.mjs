export default {
  name: "verify-fuel-reconciliation-match-rate-consistent",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-fuel-reconciliation-match-rate-consistent.mjs"]) !== 0) {
      throw new Error("verify-fuel-reconciliation-match-rate-consistent failed");
    }
  },
};
