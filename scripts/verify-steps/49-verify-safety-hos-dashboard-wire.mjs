export default {
  name: "verify-safety-hos-dashboard-wire",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:safety-hos-dashboard-wire"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
