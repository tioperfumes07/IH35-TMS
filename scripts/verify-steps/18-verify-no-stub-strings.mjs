export default {
  name: "verify-no-stub-strings",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:no-stub-strings"]) !== 0) {
      process.exit(1);
    }
  },
};
