export default {
  name: "verify-maint-pm-auto-wo-engine",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:maint-pm-auto-wo-engine"]) !== 0) {
      throw new Error("verify:maint-pm-auto-wo-engine failed");
    }
  },
};
