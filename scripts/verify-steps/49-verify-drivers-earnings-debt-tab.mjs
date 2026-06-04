export default {
  name: "verify-drivers-earnings-debt-tab",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:drivers-earnings-debt-tab"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
