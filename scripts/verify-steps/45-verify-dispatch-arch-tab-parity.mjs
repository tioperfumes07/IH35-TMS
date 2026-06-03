export default {
  name: "verify-dispatch-arch-tab-parity",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:dispatch-arch-tab-parity"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
