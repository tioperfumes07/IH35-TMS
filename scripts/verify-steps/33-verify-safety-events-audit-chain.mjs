export default {
  name: "verify-safety-events-audit-chain",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:safety-events-audit-chain"]) !== 0) {
      process.exit(1);
    }
  },
};
