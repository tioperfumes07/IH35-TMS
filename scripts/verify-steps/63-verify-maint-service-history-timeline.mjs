export default {
  name: "verify-maint-service-history-timeline",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:maint-service-history-timeline"]) !== 0) {
      throw new Error("verify:maint-service-history-timeline failed");
    }
  },
};
