export default {
  name: "verify-pre-push-env-isolation",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-pre-push-env-isolation.mjs"]) !== 0) {
      throw new Error("verify-pre-push-env-isolation failed");
    }
    if (ctx.run("node", ["scripts/verify-pre-push-env-isolation.mjs", "--selftest"]) !== 0) {
      throw new Error("verify-pre-push-env-isolation --selftest failed");
    }
  },
};
