export default {
  name: "verify-driver-suspend-atomic",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:driver-suspend-atomic"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
