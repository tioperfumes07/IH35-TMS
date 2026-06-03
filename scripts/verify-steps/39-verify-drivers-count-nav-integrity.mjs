export default {
  name: "verify-drivers-count-nav-integrity",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:drivers-count-nav-integrity"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
