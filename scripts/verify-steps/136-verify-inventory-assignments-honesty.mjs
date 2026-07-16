export default {
  name: "verify-inventory-assignments-honesty",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:inventory-assignments-honesty"]) !== 0) {
      process.exit(1);
    }
  },
};
