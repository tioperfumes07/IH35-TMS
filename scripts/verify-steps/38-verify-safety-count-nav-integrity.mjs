export default {
  name: "verify-safety-count-nav-integrity",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:safety-count-nav-integrity"]) !== 0) {
      process.exit(1);
    }
  },
};
