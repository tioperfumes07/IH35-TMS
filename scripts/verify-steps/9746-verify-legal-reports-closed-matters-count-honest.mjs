export default {
  name: "verify-legal-reports-closed-matters-count-honest",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-legal-reports-closed-matters-count-honest.mjs"]) !== 0) {
      throw new Error("verify-legal-reports-closed-matters-count-honest failed");
    }
  },
};
