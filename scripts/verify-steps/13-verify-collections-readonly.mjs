export default {
  name: "verify-collections-readonly",
  run: async (ctx) => {
    if (ctx.run("node", ["scripts/verify-collections-readonly.mjs"]) !== 0) {
      process.exit(1);
    }
  },
};
