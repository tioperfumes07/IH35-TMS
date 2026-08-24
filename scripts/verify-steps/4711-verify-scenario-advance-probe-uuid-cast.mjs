export default {
  name: "verify-scenario-advance-probe-uuid-cast",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-scenario-advance-probe-uuid-cast.mjs"]) !== 0) {
      throw new Error("verify-scenario-advance-probe-uuid-cast failed");
    }
  },
};
