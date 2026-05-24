export default {
  name: "verify-collections-readonly",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:collections-readonly"]) !== 0) {
      process.exit(1);
    }
  },
};
