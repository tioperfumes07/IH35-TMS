export default {
  name: "verify-maintenance-tab-coverage",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:maintenance-tab-coverage"]) !== 0) {
      process.exit(1);
    }
  },
};
