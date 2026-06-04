export default {
  name: "verify-dispatch-late-arrivals-alerts",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:dispatch-late-arrivals-alerts"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
