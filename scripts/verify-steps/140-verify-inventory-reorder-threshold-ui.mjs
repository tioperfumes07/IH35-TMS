export default {
  name: "verify-inventory-reorder-threshold-ui",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:inventory-reorder-threshold-ui"]) !== 0) {
      process.exit(1);
    }
  },
};
