export default {
  name: "verify-wo-status-transitions",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:wo-status-transitions"]) !== 0) {
      process.exit(1);
    }
  },
};
