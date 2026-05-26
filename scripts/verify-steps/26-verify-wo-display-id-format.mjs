export default {
  name: "verify-wo-display-id-format",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:wo-display-id-format"]) !== 0) {
      process.exit(1);
    }
  },
};
