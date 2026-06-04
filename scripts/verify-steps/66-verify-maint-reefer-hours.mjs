export default {
  name: "verify-maint-reefer-hours",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:maint-reefer-hours"]) !== 0) {
      throw new Error("verify-maint-reefer-hours failed");
    }
  },
};
