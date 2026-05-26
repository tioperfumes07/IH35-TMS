export default {
  name: "verify-safety-tab-coverage",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:safety-tab-coverage"]) !== 0) {
      process.exit(1);
    }
  },
};
