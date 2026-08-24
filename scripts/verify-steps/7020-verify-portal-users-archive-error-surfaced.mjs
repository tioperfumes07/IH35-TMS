export default {
  name: "verify-portal-users-archive-error-surfaced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-portal-users-archive-error-surfaced.mjs"]) !== 0) {
      throw new Error("verify-portal-users-archive-error-surfaced failed");
    }
  },
};
