export default {
  name: "verify-truck-planner-oos-signal-parity",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-truck-planner-oos-signal-parity.mjs"]) !== 0) {
      throw new Error("verify-truck-planner-oos-signal-parity failed");
    }
  },
};
