export default {
  name: "verify-factoring-treatment",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:factoring-treatment"]) !== 0) {
      process.exit(1);
    }
  },
};
