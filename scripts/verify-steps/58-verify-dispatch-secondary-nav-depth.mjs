export default {
  name: "verify-dispatch-secondary-nav-depth",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:dispatch-secondary-nav-depth"]) !== 0) {
      throw new Error("verify-dispatch-secondary-nav-depth failed");
    }
  },
};
