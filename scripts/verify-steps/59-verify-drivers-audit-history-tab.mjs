export default {
  name: "verify-drivers-audit-history-tab",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:drivers-audit-history-tab"]) !== 0) {
      throw new Error("verify-drivers-audit-history-tab failed");
    }
  },
};
