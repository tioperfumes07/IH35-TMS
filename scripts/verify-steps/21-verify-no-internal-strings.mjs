export default {
  name: "verify-no-internal-strings",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:no-internal-strings"]) !== 0) {
      process.exit(1);
    }
  },
};
