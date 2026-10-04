export default {
  name: "verify:planner-driver-error-message",
  run(ctx) {
    ctx.run("node", ["scripts/verify-planner-driver-error-message.mjs"]);
  },
};
