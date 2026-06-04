export default {
  name: "verify-dispatch-settings-tab",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:dispatch-settings-tab"]) !== 0) {
      throw new Error("verify-dispatch-settings-tab failed");
    }
  },
};
